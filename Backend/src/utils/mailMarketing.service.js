import crypto from 'crypto';
import nodemailer from 'nodemailer';
import sanitizeHtml from 'sanitize-html';
import Lead from '../models/Lead.model.js';
import Property from '../models/Property.model.js';
import Settings from '../models/Settings.model.js';
import MailSuppression from '../models/MailSuppression.model.js';
import { getBackendPublicUrl } from './publicUrl.js';
import { SITE_URL, propertyImageUrl, propertyPriceLine } from './email.util.js';

// ── Configuración ────────────────────────────────────────────────────────────────────────────────
export const DEFAULT_FROM_NAME = 'Silvia Fernández Propiedades';
export const MAIL_DEFAULTS = { dailyLimit: 300, minDelaySec: 20, maxDelaySec: 40, testEmail: '', replyTo: '' };

export async function getMailSettings() {
  const s = await Settings.findById('global').lean();
  return { ...MAIL_DEFAULTS, ...(s?.mailMarketing || {}) };
}

export async function updateMailSettings(patch) {
  const current = await getMailSettings();
  const next = { ...current };
  if (patch.dailyLimit !== undefined) next.dailyLimit = Math.round(Number(patch.dailyLimit));
  if (patch.minDelaySec !== undefined) next.minDelaySec = Math.round(Number(patch.minDelaySec));
  if (patch.maxDelaySec !== undefined) next.maxDelaySec = Math.round(Number(patch.maxDelaySec));
  if (patch.testEmail !== undefined) next.testEmail = normalizeEmail(patch.testEmail);
  if (patch.replyTo !== undefined) next.replyTo = normalizeEmail(patch.replyTo);

  if (!Number.isFinite(next.dailyLimit) || next.dailyLimit < 1 || next.dailyLimit > 2000) throw httpError(400, 'El tope diario tiene que estar entre 1 y 2000.');
  if (!Number.isFinite(next.minDelaySec) || next.minDelaySec < 5) throw httpError(400, 'El intervalo mínimo tiene que ser de al menos 5 segundos.');
  if (!Number.isFinite(next.maxDelaySec) || next.maxDelaySec < next.minDelaySec || next.maxDelaySec > 600) throw httpError(400, 'El intervalo máximo tiene que ser mayor o igual al mínimo (y hasta 600 s).');
  if (next.testEmail && !isValidEmail(next.testEmail)) throw httpError(400, 'El email de prueba no es válido.');
  if (next.replyTo && !isValidEmail(next.replyTo)) throw httpError(400, 'El email de respuesta no es válido.');

  await Settings.findByIdAndUpdate('global', { $set: { mailMarketing: next } }, { upsert: true });
  return next;
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── SMTP (cuenta propia del Mail Marketing; los avisos de leads siguen por SMTP_USER) ───────────
let transporter = null;
let transporterKey = '';

export function getSmtpInfo() {
  return { configured: !!(process.env.MKT_SMTP_USER && process.env.MKT_SMTP_PASS), user: process.env.MKT_SMTP_USER || '' };
}

// Bajo demanda, por el mismo motivo que en email.util.js (dotenv se carga después de los imports).
export function getMarketingTransporter() {
  const key = `${process.env.MKT_SMTP_HOST}|${process.env.MKT_SMTP_PORT}|${process.env.MKT_SMTP_USER}|${process.env.MKT_SMTP_PASS}`;
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport({
      host: process.env.MKT_SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.MKT_SMTP_PORT) || 587,
      secure: Number(process.env.MKT_SMTP_PORT) === 465,
      auth: { user: process.env.MKT_SMTP_USER, pass: process.env.MKT_SMTP_PASS },
    });
    transporterKey = key;
  }
  return transporter;
}

// Gmail no deja reintentar con éxito después de estos: hay que frenar y que lo revise una persona.
const LIMIT_RX = /quota|rate|limit|exceeded|too many|try again later|unusual|suspicious|block|suspend|unsolicited|spam|5\.4\.5|4\.7\.0|5\.7\.0|4\.7\.28|5\.7\.28/i;

// 'pause' → pausar la campaña entera. 'permanent' → el destinatario no existe/no acepta (se suprime).
// 'transient' → reintentar ese destinatario más tarde.
export function classifySmtpError(err) {
  const code = Number(err?.responseCode) || 0;
  const text = `${err?.response || ''} ${err?.message || ''}`;
  if (err?.code === 'EAUTH' || code === 535 || code === 534) return 'pause';
  if (code === 421 || code === 454) return 'pause';
  if (code >= 400 && LIMIT_RX.test(text)) return 'pause';
  if (code >= 500) return 'permanent';
  if (err?.code === 'EENVELOPE') return 'permanent';
  return 'transient';
}

export function smtpErrorText(err) {
  return String(err?.response || err?.message || err || 'Error desconocido').slice(0, 500);
}

// ── Emails ───────────────────────────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;
// Dominios que casi seguro son un error de tipeo: se excluyen salvo que se los incluya a mano.
export const SUSPICIOUS_DOMAINS = ['gmail.com.ar'];

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

export function isSuspiciousEmail(email) {
  const domain = email.split('@')[1] || '';
  return SUSPICIOUS_DOMAINS.includes(domain);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function emailMatchQuery(email) {
  return { $regex: `^\\s*${escapeRegex(email)}\\s*$`, $options: 'i' };
}

// ── Audiencia ────────────────────────────────────────────────────────────────────────────────────
// Fechas en hora Argentina (UTC-3, sin horario de verano).
function arDate(day, endOfDay) {
  return new Date(`${day}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`);
}

async function buildLeadFilter(filters = {}) {
  const filter = { email: { $exists: true, $nin: [null, ''] } };
  if (filters.statuses?.length) filter.status = { $in: filters.statuses };
  if (filters.sources?.length) filter.source = { $in: filters.sources };
  if (filters.dateFrom || filters.dateTo) {
    filter.createdAt = {};
    if (filters.dateFrom) filter.createdAt.$gte = arDate(filters.dateFrom, false);
    if (filters.dateTo) filter.createdAt.$lte = arDate(filters.dateTo, true);
  }
  let propertyIds = (filters.propertyIds || []).map(Number).filter(Number.isFinite);
  if (filters.zones?.length) {
    // Tokko tiene la misma zona con distintas mayúsculas ("Mar De Las Pampas" / "Mar de las Pampas")
    const zoneRx = filters.zones.map((z) => new RegExp(`^\\s*${escapeRegex(z.trim())}\\s*$`, 'i'));
    const inZone = await Property.find({ 'location.name': { $in: zoneRx } }, { id: 1 }).lean();
    const zoneIds = inZone.map((p) => p.id);
    // Propiedad y zona a la vez: tiene que cumplir las dos
    propertyIds = propertyIds.length ? propertyIds.filter((id) => zoneIds.includes(id)) : zoneIds;
    if (!propertyIds.length) propertyIds = [-1];
  }
  if (propertyIds.length) filter.propertyId = { $in: propertyIds };
  return filter;
}

export function cleanFilters(raw = {}) {
  const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : undefined);
  return {
    statuses: list(raw.statuses),
    sources: list(raw.sources),
    dateFrom: day(raw.dateFrom),
    dateTo: day(raw.dateTo),
    propertyIds: (Array.isArray(raw.propertyIds) ? raw.propertyIds : []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    zones: list(raw.zones),
  };
}

// Devuelve los destinatarios finales (un email = un destinatario, con los datos del lead más
// reciente dentro del filtro) y el detalle de lo que se descartó.
export async function resolveAudience(filters, includeEmails = []) {
  const leadFilter = await buildLeadFilter(filters);
  const [leads, suppressions] = await Promise.all([
    Lead.find(leadFilter, { email: 1, name: 1, propertyTitle: 1, propertyId: 1, createdAt: 1, emailOptOut: 1 }).sort({ createdAt: -1 }).lean(),
    MailSuppression.find({}, { email: 1, reason: 1 }).lean(),
  ]);
  const suppressed = new Map(suppressions.map((s) => [s.email, s.reason]));
  const optedOut = new Set();
  // Si cualquier lead con ese email se dio de baja, el email queda afuera (aunque el más reciente no tenga la marca)
  const optOutLeads = await Lead.find({ emailOptOut: { $ne: null } }, { email: 1 }).lean();
  optOutLeads.forEach((l) => optedOut.add(normalizeEmail(l.email)));

  const included = new Set((includeEmails || []).map(normalizeEmail));
  const seen = new Set();
  const recipients = [];
  const excluded = { duplicates: 0, invalid: [], unsubscribed: 0, bounced: 0, suspicious: [] };

  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (seen.has(email)) { excluded.duplicates += 1; continue; }
    seen.add(email);
    if (!isValidEmail(email)) { excluded.invalid.push(email); continue; }
    const reason = suppressed.get(email) || (optedOut.has(email) ? 'unsubscribed' : null);
    if (reason === 'unsubscribed') { excluded.unsubscribed += 1; continue; }
    if (reason === 'bounced') { excluded.bounced += 1; continue; }
    const recipient = { email, lead: lead._id, name: lead.name || '', propertyTitle: lead.propertyTitle || '' };
    if (isSuspiciousEmail(email)) {
      const isIncluded = included.has(email);
      excluded.suspicious.push({ email, name: lead.name || '', included: isIncluded });
      if (!isIncluded) continue;
    }
    recipients.push(recipient);
  }
  return { recipients, excluded, leadsMatched: leads.length };
}

// ── Personalización ──────────────────────────────────────────────────────────────────────────────
function titleCase(s) {
  return s.toLocaleLowerCase('es-AR').replace(/(^|[\s'-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toLocaleUpperCase('es-AR'));
}

function cleanName(name) {
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!n || /@|\d/.test(n)) return '';
  return titleCase(n);
}

export function recipientVars(recipient) {
  const full = cleanName(recipient.name);
  return {
    nombre: full.split(' ')[0] || '',
    nombre_completo: full,
    email: recipient.email || '',
    propiedad: String(recipient.propertyTitle || '').trim().replace(/\s+/g, ' '),
  };
}

export const VARIABLES = [
  { key: 'nombre', label: 'Nombre', hint: 'Primer nombre. Si no hay, se borra junto con el espacio de antes ("Hola {{nombre}}," → "Hola,").' },
  { key: 'nombre_completo', label: 'Nombre completo', hint: 'Nombre y apellido tal como está en el lead.' },
  { key: 'propiedad', label: 'Propiedad', hint: 'Título de la propiedad que consultó (lead más reciente).' },
  { key: 'email', label: 'Email', hint: 'Email del destinatario.' },
];

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// {{var}} o {{var|texto por defecto}}. Variable vacía sin texto por defecto: se borra con el espacio previo.
export function personalize(text, vars, { html }) {
  return String(text || '').replace(/(\s|&nbsp;)*\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (match, _ws, key, fallback) => {
    const k = key.toLowerCase();
    if (!(k in vars)) return match;
    const leading = match.slice(0, match.indexOf('{{'));
    const value = vars[k] || (fallback || '').trim();
    if (!value) return '';
    return leading + (html ? escapeHtml(value) : value);
  });
}

// ── HTML para clientes de mail ───────────────────────────────────────────────────────────────────
const FONT = "font-family:Arial,Helvetica,sans-serif;";
const INLINE_STYLES = {
  p: `${FONT}margin:0 0 14px;font-size:15px;line-height:1.6;color:#22312a;`,
  h1: `${FONT}margin:0 0 14px;font-size:24px;line-height:1.3;color:#15784f;`,
  h2: `${FONT}margin:0 0 12px;font-size:20px;line-height:1.3;color:#15784f;`,
  h3: `${FONT}margin:0 0 10px;font-size:17px;line-height:1.35;color:#15784f;`,
  a: 'color:#15784f;text-decoration:underline;',
  ul: `${FONT}margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.6;color:#22312a;`,
  ol: `${FONT}margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.6;color:#22312a;`,
  li: 'margin:0 0 4px;',
  blockquote: `${FONT}margin:0 0 14px;padding:4px 0 4px 14px;border-left:3px solid #c9e4d6;color:#4a5b52;`,
  hr: 'border:none;border-top:1px solid #e6ece8;margin:20px 0;',
  img: 'display:block;max-width:100%;height:auto;border:0;margin:0 0 14px;',
  code: 'font-family:monospace;background:#f3f6f4;padding:1px 4px;border-radius:4px;',
};

const SANITIZE_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span', 'center', 'font', 'u', 's']),
  allowedAttributes: {
    '*': ['style', 'align', 'width', 'height', 'bgcolor', 'valign', 'class'],
    a: ['href', 'target', 'title', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    table: ['cellpadding', 'cellspacing', 'border', 'role', 'width', 'style', 'align', 'bgcolor'],
    td: ['colspan', 'rowspan', 'width', 'style', 'align', 'valign', 'bgcolor'],
    div: ['style', 'align', 'data-property-block', 'data-property-id'],
    font: ['color', 'face', 'size'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: Object.fromEntries(Object.entries(INLINE_STYLES).map(([tag, base]) => [tag, (tagName, attribs) => ({
    tagName,
    attribs: { ...attribs, style: `${base}${attribs.style || ''}` },
  })])),
};

// Párrafos vacíos de TipTap (<p></p>) colapsan a 0 de alto en Outlook: se les pone un espacio.
function fixEmptyParagraphs(html) {
  return html.replace(/<p([^>]*)>\s*<\/p>/g, '<p$1>&nbsp;</p>');
}

function propertyBlockHtml(property) {
  const title = property.publication_title || property.address || `Propiedad #${property.id}`;
  const zone = property.location?.name || '';
  const price = propertyPriceLine(property);
  const image = propertyImageUrl(property);
  const url = `${SITE_URL}/propiedad/${property.id}`;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e6ece8;border-radius:12px;border-collapse:separate;margin:0 0 16px;background:#ffffff;">
  ${image ? `<tr><td style="padding:0;"><a href="${escapeHtml(url)}" style="text-decoration:none;"><img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" width="542" style="display:block;width:100%;max-width:542px;height:auto;border:0;border-radius:12px 12px 0 0;" /></a></td></tr>` : ''}
  <tr><td style="padding:16px 18px;${FONT}">
    <div style="${FONT}font-size:17px;font-weight:bold;line-height:1.35;color:#15784f;margin:0 0 4px;">${escapeHtml(title)}</div>
    ${zone ? `<div style="${FONT}font-size:13px;color:#5a6b62;margin:0 0 6px;">${escapeHtml(zone)}</div>` : ''}
    ${price ? `<div style="${FONT}font-size:15px;font-weight:bold;color:#22312a;margin:0 0 14px;">${escapeHtml(price)}</div>` : ''}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#15784f" style="border-radius:8px;">
      <a href="${escapeHtml(url)}" style="${FONT}display:inline-block;padding:11px 20px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Ver propiedad</a>
    </td></tr></table>
  </td></tr>
</table>`;
}

const BLOCK_RX = /<div[^>]*data-property-id="(\d+)"[^>]*>\s*(?:<\/div>)?/g;

// Expande los bloques "Insertar propiedad" con los datos actuales de la propiedad (precio y foto
// pueden haber cambiado desde que se armó la campaña). Si la propiedad ya no existe, el bloque se quita.
async function expandPropertyBlocks(html) {
  const ids = [...html.matchAll(BLOCK_RX)].map((m) => Number(m[1]));
  if (!ids.length) return html;
  const props = await Property.find({ id: { $in: ids } }, { id: 1, publication_title: 1, address: 1, location: 1, operations: 1, photos: { $slice: 1 } }).lean();
  const byId = new Map(props.map((p) => [p.id, p]));
  return html.replace(BLOCK_RX, (_m, id) => {
    const p = byId.get(Number(id));
    return p ? propertyBlockHtml(p) : '';
  });
}

// Cuerpo listo para mail pero todavía con las {{variables}}: es igual para todos los destinatarios,
// así que el worker lo arma una sola vez por campaña.
export async function buildCampaignBody(html) {
  const safe = sanitizeHtml(fixEmptyParagraphs(String(html || '')), SANITIZE_OPTIONS);
  return expandPropertyBlocks(safe);
}

function htmlToText(html) {
  return html
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
      const t = text.replace(/<[^>]+>/g, '').trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n').map((line) => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function layoutHtml({ subject, preheader, body, unsubscribeUrl }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f6f4;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f6f4;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f6f4" style="background:#f3f6f4;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border-collapse:separate;">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #e6ece8;${FONT}font-size:18px;font-weight:bold;color:#15784f;">
        <a href="${SITE_URL}" style="color:#15784f;text-decoration:none;">Silvia Fernández Propiedades</a>
      </td></tr>
      <tr><td style="padding:24px 28px 12px;${FONT}font-size:15px;line-height:1.6;color:#22312a;">
${body}
      </td></tr>
    </table>
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td align="center" style="padding:16px 28px;${FONT}font-size:12px;line-height:1.5;color:#7a8a82;">
        Recibís este mail porque nos consultaste por una propiedad.<br>
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#7a8a82;text-decoration:underline;">No quiero recibir más mails</a>
        · <a href="${SITE_URL}" style="color:#7a8a82;text-decoration:underline;">silviafernandezpropiedades.com.ar</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Bajas ────────────────────────────────────────────────────────────────────────────────────────
function unsubscribeSecret() {
  return process.env.MAIL_UNSUB_SECRET || process.env.SECRET_JWT || '';
}

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');

export function signUnsubscribe(email) {
  return crypto.createHmac('sha256', unsubscribeSecret()).update(`unsub:${email}`).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribe(encodedEmail, token) {
  let email = '';
  try { email = normalizeEmail(Buffer.from(String(encodedEmail || ''), 'base64url').toString('utf8')); } catch { return null; }
  if (!email || !token) return null;
  const expected = signUnsubscribe(email);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return email;
}

// campaignId 'test' = mail de prueba: el link funciona pero no registra la baja.
export function unsubscribeUrl(email, campaignId) {
  return `${getBackendPublicUrl()}/api/public/mail/unsubscribe?e=${b64url(email)}&c=${campaignId}&t=${signUnsubscribe(email)}`;
}

export async function registerUnsubscribe(email, campaignId) {
  const now = new Date();
  await MailSuppression.findOneAndUpdate(
    { email },
    { $set: { reason: 'unsubscribed', at: now, ...(campaignId ? { campaign: campaignId } : {}) } },
    { upsert: true }
  );
  await Lead.updateMany({ email: emailMatchQuery(email), emailOptOut: null }, { $set: { emailOptOut: now } });
}

export async function registerBounce(email, detail, campaignId) {
  // Una baja pesa más que un rebote: no se pisa
  await MailSuppression.updateOne(
    { email, reason: { $ne: 'unsubscribed' } },
    { $set: { reason: 'bounced', detail, at: new Date(), campaign: campaignId } },
    { upsert: true }
  ).catch((err) => { if (err.code !== 11000) throw err; });
}

// ── Armado y envío de un mail ────────────────────────────────────────────────────────────────────
export function renderMessage({ campaign, body, recipient, campaignKey }) {
  const vars = recipientVars(recipient);
  const subject = personalize(campaign.subject, vars, { html: false }).trim() || '(sin asunto)';
  const preheader = personalize(campaign.preheader || '', vars, { html: false }).trim();
  const unsubUrl = unsubscribeUrl(recipient.email, campaignKey);
  const html = layoutHtml({ subject, preheader, body: personalize(body, vars, { html: true }), unsubscribeUrl: unsubUrl });
  return { subject, html, text: `${htmlToText(personalize(body, vars, { html: true }))}\n\n—\nPara no recibir más mails: ${unsubUrl}`, unsubUrl };
}

export async function sendMessage({ campaign, body, recipient, campaignKey, subjectPrefix = '' }) {
  const settings = await getMailSettings();
  const { subject, html, text, unsubUrl } = renderMessage({ campaign, body, recipient, campaignKey });
  const fromEmail = process.env.MKT_SMTP_USER;
  const fromName = (campaign.fromName || DEFAULT_FROM_NAME).replace(/"/g, '');
  return getMarketingTransporter().sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: recipient.email,
    ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
    subject: `${subjectPrefix}${subject}`,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>, <mailto:${fromEmail}?subject=baja>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
