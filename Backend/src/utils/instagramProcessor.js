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

// Mensaje que recibiría un comentario INFO en un post (base para editarlo por post)
export function defaultPostMessage(config, isSale) {
  const rules = config?.rules || [];
  const rule = rules.find((r) => r.key === 'info') || rules.find((r) => r.key !== 'alquiler') || rules[0];
  const msg = rule?.message || '';
  return isSale ? addSaleContact(msg, config?.saleContactLine ?? DEFAULT_SALE_CONTACT_LINE) : msg;
}

export async function isSaleProperty(propertyId) {
  if (!propertyId) return false;
  const p = await Property.findOne({ id: propertyId }, { 'operations.operation_type': 1 }).lean();
  return (p?.operations || []).some((o) => /venta/i.test(o.operation_type || ''));
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
  // Solo en la regla general (INFO) y si el post es de una propiedad en venta: Silvia primero
  let ruleMessage = match.rule.message;
  if (mapping?.custom_message?.trim()) {
    ruleMessage = mapping.custom_message; // mensaje editado a mano para este post
  } else if (match.rule.key !== 'alquiler' && await isSaleProperty(propertyId)) {
    ruleMessage = addSaleContact(ruleMessage, config.saleContactLine ?? DEFAULT_SALE_CONTACT_LINE);
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
