import IgConfig from '../models/IgConfig.model.js';
import IgLead from '../models/IgLead.model.js';
import IgMediaMap from '../models/IgMediaMap.model.js';
import Property from '../models/Property.model.js';
import { matchRule } from './instagramMatcher.js';
import { getAccount, sendPrivateReply, replyToComment, metaError, isRetryable } from './instagram.service.js';

// Mismo dominio que usa email.util.js para el link público de la ficha.
const SITE_URL = (process.env.SITE_URL || 'https://www.silviafernandezpropiedades.com.ar').replace(/\/$/, '');
const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 3600 * 1000;
const BACKOFF_MS = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 6 * 3600e3]; // 5 reintentos
const CLAIM_MS = 10 * 60e3; // mientras un envío está en curso, el cron no lo toma

export function propertyUrl(propertyId) {
  return `${SITE_URL}/propiedad/${propertyId}`;
}

// En posts asociados a una propiedad en VENTA se agrega este contacto primero en la lista.
export const DEFAULT_SALE_CONTACT_LINE = 'Silvia: +54 9 225550-9408';

export function addSaleContact(message, line) {
  const text = String(message || '');
  const contact = String(line || '').trim();
  if (!contact || text.includes(contact)) return text;
  // Primera línea con formato "Nombre: +54..." = inicio de la lista de asesores
  const m = text.match(/^[^\n:]{1,40}:\s*\+?\d/m);
  if (!m) return `${text}\n\n${contact}`;
  return `${text.slice(0, m.index)}${contact}\n${text.slice(m.index)}`;
}

// ── Mensaje armado con los datos de la propiedad del post ─────────────────────────────────────
export const DEFAULT_SALE_CONTACTS = [
  'Silvia: +54 9 225550-9408',
  'Paul: +54 9 225460-2453',
  'Pablo: +54 9 225560-9992',
  'Valentín: +54 9 225562-2841',
  'Cecilia: +54 9 221600-6474',
].join('\n');

export const PROPERTY_DM_FIELDS = {
  id: 1, publication_title: 1, address: 1, 'location.name': 1, 'type.name': 1, operations: 1,
  suite_amount: 1, bathroom_amount: 1, surface: 1, total_surface: 1, guests_amount: 1, distanciaMar: 1, distMar: 1,
};

const CONTACT_LINE_RX = /^[^\n:]{1,40}:\s*\+?\d[\d\s-]{6,}$/;

// Líneas "Nombre: +54 9 ..." de un texto (para reutilizar los contactos de cada regla)
function contactLines(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter((l) => CONTACT_LINE_RX.test(l));
}

const opKind = (p) => {
  const ops = p?.operations || [];
  if (ops.some((o) => /venta|sale/i.test(o.operation_type || ''))) return 'venta';
  if (ops.some((o) => /tempor/i.test(o.operation_type || ''))) return 'temporario';
  if (ops.some((o) => /alquiler|rent/i.test(o.operation_type || ''))) return 'alquiler';
  return null;
};

const fmtNum = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

function salePrice(p) {
  const op = (p.operations || []).find((o) => /venta|sale/i.test(o.operation_type || ''));
  const pr = op?.prices?.[0];
  if (!op || op.show_price === false || !pr?.price || pr.price <= 1) return '';
  const cur = !pr.currency || /usd|d[oó]lar/i.test(pr.currency) ? 'USD' : '$';
  return `${cur} ${fmtNum(pr.price)}`;
}

function seaDistance(p) {
  const d = String(p.distanciaMar || p.distMar || '').trim();
  if (!d) return '';
  if (/^\d+([.,]\d+)?$/.test(d)) return `a ${fmtNum(parseFloat(d.replace(',', '.')))} m del mar`;
  return /mar/i.test(d) ? d : `a ${d} del mar`;
}

// Texto del DM para un post vinculado a una propiedad. Usa {link} para la ficha.
export function propertyDmMessage(p, config) {
  const kind = opKind(p);
  const rules = config?.rules || [];
  const rentRule = rules.find((r) => r.key === 'alquiler');
  const infoRule = rules.find((r) => r.key === 'info') || rules.find((r) => r.key !== 'alquiler');
  const isRent = kind === 'temporario' || kind === 'alquiler';

  const title = String(p.publication_title || '').trim()
    || `${p.type?.name || 'Propiedad'}${p.location?.name ? ` en ${p.location.name}` : ''}`;
  const where = [p.address, p.location?.name].map((s) => String(s || '').trim()).filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i).join(', ');
  const sea = seaDistance(p);

  const bullets = [];
  if (p.suite_amount || p.bathroom_amount) {
    bullets.push([p.suite_amount && plural(p.suite_amount, 'dormitorio', 'dormitorios'), p.bathroom_amount && plural(p.bathroom_amount, 'baño', 'baños')].filter(Boolean).join(' y '));
  }
  const lot = parseFloat(String(p.surface || '').replace(',', '.'));
  if (lot > 0) bullets.push(`Lote de ${fmtNum(lot)} m²`);
  if (kind === 'temporario' && p.guests_amount) bullets.push(`Capacidad: hasta ${plural(p.guests_amount, 'persona', 'personas')}`);
  const price = kind === 'venta' ? salePrice(p) : '';
  if (price) bullets.push(`Valor: ${price}`);

  const contacts = kind === 'venta'
    ? contactLines(config?.saleContacts ?? DEFAULT_SALE_CONTACTS)
    : contactLines((isRent ? rentRule : infoRule)?.message);

  const out = ['¡Hola! ¿Cómo estás?', '', title];
  if (where || sea) out.push(`📍 ${[where, sea].filter(Boolean).join(' · ')}`);
  if (bullets.length) out.push('', ...bullets.map((b) => `✔️ ${b}`));
  out.push('', 'Te dejo la ficha de la propiedad:', '{link}');
  if (contacts.length) {
    out.push('', isRent ? 'Para consultar disponibilidad y precio, escribinos por WhatsApp:' : 'Para más información o coordinar una visita, escribinos por WhatsApp:', ...contacts);
  }
  out.push('', 'Silvia Fernández Propiedades');
  return out.join('\n');
}

// Mensaje que se manda en un post (base para el botón "Editar mensaje")
export function defaultPostMessage(config, property) {
  if (property) return propertyDmMessage(property, config).replace(/\{link\}/g, propertyUrl(property.id));
  const rules = config?.rules || [];
  const rule = rules.find((r) => r.key === 'info') || rules.find((r) => r.key !== 'alquiler') || rules[0];
  return rule?.message || '';
}

export async function getConfig() {
  const existing = await IgConfig.findById('global').lean();
  if (existing) return existing;
  return (await IgConfig.create({ _id: 'global' })).toObject();
}

// Texto del DM: mensaje de la regla + link a la ficha si el post está asociado a una propiedad.
// Si el mensaje ya trae {link}, se reemplaza ahí; si no, se agrega propertyLinkTemplate al final.
export function buildDmText(message, propertyId, linkTemplate) {
  let base = String(message || '').trim();
  if (!propertyId) return base.replace(/\{link\}/g, '').trim();
  const url = propertyUrl(propertyId);
  if (base.includes('{link}')) return base.replace(/\{link\}/g, url);
  if (base.includes(url)) return base; // mensaje editado que ya trae el link de la ficha
  // Con ficha de propiedad, se saca la línea con el link a la home: Instagram arma la vista previa
  // con el PRIMER link del mensaje, y así muestra la portada de la propiedad.
  const home = SITE_URL.replace(/^https?:\/\/(www\.)?/, '');
  base = base.split('\n').filter((line) => !new RegExp(`^\\s*https?://(www\\.)?${home.replace(/\./g, '\\.')}/?\\s*$`, 'i').test(line)).join('\n').trim();
  // El texto del link siempre va en un párrafo aparte (si no, se pega al link anterior y lo rompe)
  const tpl = String(linkTemplate || '{link}').trim() || '{link}';
  return `${base}\n\n${tpl.replace(/\{link\}/g, url)}`;
}

// Punto de entrada del webhook (ya validada la firma). Nunca tira: loguea.
export async function handleWebhookPayload(body) {
  if (body?.object !== 'instagram') return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'comments' && change.field !== 'live_comments') continue;
      try {
        await processCommentEvent(entry, change.value || {});
      } catch (err) {
        console.error('[instagram] Error procesando comentario:', err);
      }
    }
    // `messages` se suscribe para poder responder en la ventana de 24 h; por ahora solo se registra.
    for (const m of entry.messaging || []) {
      if (m.message?.is_echo) continue;
      console.log(`[instagram] DM recibido de ${m.sender?.id}: ${String(m.message?.text || '').slice(0, 80)}`);
    }
  }
}

export async function processCommentEvent(entry, value) {
  const commentId = String(value.id || value.comment_id || '');
  if (!commentId) return { action: 'ignored', reason: 'sin comment_id' };
  const from = value.from || {};

  const account = await getAccount();
  const ownIds = [entry.id, account?.ig_user_id, account?.app_scoped_id].filter(Boolean).map(String);
  if (ownIds.includes(String(from.id)) || (account?.username && from.username === account.username)) {
    return { action: 'ignored', reason: 'comentario propio' };
  }

  const config = await getConfig();
  const match = matchRule(value.text, config.rules);
  if (!match) return { action: 'ignored', reason: 'sin keyword' };

  const mediaId = value.media?.id ? String(value.media.id) : undefined;
  const mapping = mediaId ? await IgMediaMap.findOne({ media_id: mediaId }).lean() : null;
  const propertyId = mapping?.property_id;
  // Prioridad: mensaje editado para este post > mensaje armado con los datos de la propiedad > mensaje de la regla
  let ruleMessage = match.rule.message;
  if (mapping?.custom_message?.trim()) {
    ruleMessage = mapping.custom_message;
  } else if (propertyId) {
    const prop = await Property.findOne({ id: propertyId }, PROPERTY_DM_FIELDS).lean();
    if (prop) ruleMessage = propertyDmMessage(prop, config);
  }

  let skipReason = null;
  if (!config.enabled) skipReason = 'Automatización apagada';
  else if (!account) skipReason = 'Instagram no conectado';

  let lead;
  try {
    lead = await IgLead.create({
      comment_id: commentId,
      parent_comment_id: value.parent_id,
      ig_user_id: from.id ? String(from.id) : undefined,
      ig_username: from.username,
      comment_text: value.text,
      keyword: match.keyword,
      rule_key: match.rule.key,
      media_id: mediaId,
      media_product_type: value.media?.media_product_type,
      permalink: mapping?.permalink,
      property_id: propertyId,
      status: skipReason ? 'skipped' : 'pending',
      skip_reason: skipReason,
      dm_text: buildDmText(ruleMessage, propertyId, config.propertyLinkTemplate),
      next_attempt_at: skipReason ? undefined : new Date(Date.now() + CLAIM_MS),
      comment_created_at: entry.time ? new Date(entry.time * (entry.time > 1e12 ? 1 : 1000)) : new Date(),
    });
  } catch (err) {
    if (err.code === 11000) return { action: 'duplicate' };
    throw err;
  }

  if (skipReason) return { action: 'skipped', reason: skipReason, leadId: lead._id };
  await attemptSend(lead._id);
  return { action: 'processed', leadId: lead._id };
}

// Intenta mandar el DM (y la respuesta pública opcional). Maneja reintentos con backoff.
export async function attemptSend(leadId) {
  const lead = await IgLead.findById(leadId);
  if (!lead || lead.status !== 'pending') return;

  const createdAt = lead.comment_created_at || lead.createdAt;
  if (Date.now() - new Date(createdAt).getTime() > PRIVATE_REPLY_WINDOW_MS) {
    lead.status = 'failed';
    lead.error = 'Fuera de la ventana de 7 días para private replies';
    lead.next_attempt_at = undefined;
    await lead.save();
    return;
  }

  lead.attempts += 1;
  try {
    const res = await sendPrivateReply(lead.comment_id, lead.dm_text);
    lead.status = 'sent';
    lead.dm_message_id = res?.message_id;
    lead.dm_sent_at = new Date();
    lead.error = null;
    lead.next_attempt_at = undefined;
    await lead.save();
    console.log(`[instagram] DM enviado a @${lead.ig_username} (comentario ${lead.comment_id})`);
  } catch (err) {
    const msg = metaError(err);
    const retry = isRetryable(err) && lead.attempts <= BACKOFF_MS.length;
    lead.error = msg;
    lead.status = retry ? 'pending' : 'failed';
    lead.next_attempt_at = retry ? new Date(Date.now() + BACKOFF_MS[lead.attempts - 1]) : undefined;
    await lead.save();
    console.error(`[instagram] Error enviando DM (comentario ${lead.comment_id}, intento ${lead.attempts}${retry ? ', se reintenta' : ', definitivo'}):`, msg);
    return;
  }

  await maybePublicReply(lead);
}

async function maybePublicReply(lead) {
  const config = await getConfig();
  const variants = (config.publicReplies || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (!config.publicReplyEnabled || !variants.length || lead.public_reply_status === 'sent') return;
  // Rotación atómica entre las variantes
  const updated = await IgConfig.findByIdAndUpdate('global', { $inc: { publicReplyIndex: 1 } }, { new: false }).lean();
  const text = variants[(updated?.publicReplyIndex || 0) % variants.length];
  try {
    const res = await replyToComment(lead.comment_id, text);
    await IgLead.updateOne({ _id: lead._id }, { $set: { public_reply_status: 'sent', public_reply_text: text, public_reply_id: res?.id, public_reply_error: null } });
  } catch (err) {
    const msg = metaError(err);
    await IgLead.updateOne({ _id: lead._id }, { $set: { public_reply_status: 'failed', public_reply_text: text, public_reply_error: msg } });
    console.error(`[instagram] Error en respuesta pública (comentario ${lead.comment_id}):`, msg);
  }
}

// Cron: toma los pendientes cuyo reintento ya venció. El claim atómico evita doble envío.
export async function processRetryQueue() {
  const now = new Date();
  const due = await IgLead.find({ status: 'pending', next_attempt_at: { $lte: now } }, { _id: 1 }).limit(20).lean();
  for (const { _id } of due) {
    const claimed = await IgLead.findOneAndUpdate(
      { _id, status: 'pending', next_attempt_at: { $lte: now } },
      { $set: { next_attempt_at: new Date(Date.now() + CLAIM_MS) } },
    );
    if (claimed) await attemptSend(_id);
  }
}
