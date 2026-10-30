import crypto from 'crypto';
import IgLead from '../models/IgLead.model.js';
import IgConfig from '../models/IgConfig.model.js';
import IgMediaMap from '../models/IgMediaMap.model.js';
import IgAccount from '../models/IgAccount.model.js';
import IgDeletionRequest from '../models/IgDeletionRequest.model.js';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';
import * as ig from '../utils/instagram.service.js';
import { handleWebhookPayload, getConfig, attemptSend, propertyUrl, defaultPostMessage } from '../utils/instagramProcessor.js';

const OAUTH_STATE_TTL = 10 * 60 * 1000;
const oauthStates = new Map(); // state → { validUntil, userName }

function crmUrl(path = '') {
  return `${(process.env.CRM_PUBLIC_URL || 'https://crm.silviafernandezpropiedades.com.ar').replace(/\/$/, '')}${path}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ── Webhook (público: lo llama Meta) ────────────────────────────────────────────────────────────

export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && safeEqual(token, process.env.WEBHOOK_VERIFY_TOKEN || '')) {
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }
  return res.sendStatus(403);
}

// req.body es un Buffer (express.raw montado en index.js antes de express.json) para poder
// validar X-Hub-Signature-256 sobre los bytes exactos que mandó Meta.
export function receiveWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const header = req.get('x-hub-signature-256') || '';
  const expected = `sha256=${crypto.createHmac('sha256', process.env.IG_APP_SECRET || '').update(raw).digest('hex')}`;
  if (!header || !safeEqual(header, expected)) {
    console.warn('[instagram] Webhook con firma inválida rechazado');
    return res.sendStatus(403);
  }

  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  res.sendStatus(200); // 200 inmediato; el procesamiento sigue en segundo plano
  setImmediate(() => {
    handleWebhookPayload(body).catch((err) => console.error('[instagram] Error en webhook:', err));
  });
  return undefined;
}

// ── OAuth ──────────────────────────────────────────────────────────────────────────────────────

export function connect(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, { validUntil: Date.now() + OAUTH_STATE_TTL, userName: req.user?.name });
  res.redirect(ig.buildAuthUrl(state));
}

// Público: Instagram redirige acá (crm.silviafernandezpropiedades.com.ar/api/instagram/oauth/callback)
export async function oauthCallback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  const back = (status, msg) => res.redirect(crmUrl(`/?tab=instagram&ig=${status}${msg ? `&msg=${encodeURIComponent(String(msg).slice(0, 300))}` : ''}`));

  const pending = oauthStates.get(state);
  oauthStates.delete(state);
  if (error) return back('error', errorDescription || error);
  if (!pending || pending.validUntil < Date.now()) return back('error', 'Estado inválido o expirado. Reintentá la conexión desde el CRM.');
  if (!code) return back('error', 'Instagram no devolvió el código de autorización.');

  try {
    const account = await ig.connectWithCode(code, pending.userName);
    await Activity.create({ type: 'instagram_connect', description: `${pending.userName || 'Alguien'} conectó Instagram @${account.username}`, userName: pending.userName, entityType: 'instagram' }).catch(() => {});
    return back('ok');
  } catch (err) {
    console.error('[instagram] Error en OAuth callback:', ig.metaError(err));
    return back('error', ig.metaError(err));
  }
}

// ── Data Deletion Request Callback (público: lo llama Meta) ─────────────────────────────────────

function base64UrlDecode(input) {
  return Buffer.from(String(input).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function parseSignedRequest(signedRequest, secret) {
  const [encodedSig, payload] = String(signedRequest || '').split('.', 2);
  if (!encodedSig || !payload) return null;
  const sig = base64UrlDecode(encodedSig);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(base64UrlDecode(payload).toString('utf8'));
    if (data.algorithm && String(data.algorithm).toUpperCase() !== 'HMAC-SHA256') return null;
    return data;
  } catch {
    return null;
  }
}

export async function deleteDataForUser(igUserId) {
  const uid = String(igUserId);
  const { deletedCount } = await IgLead.deleteMany({ ig_user_id: uid });
  const account = await IgAccount.findById('main').lean();
  let accountDisconnected = false;
  if (account && [account.ig_user_id, account.app_scoped_id].includes(uid)) {
    await IgAccount.deleteOne({ _id: 'main' });
    await IgConfig.updateOne({ _id: 'global' }, { $set: { enabled: false } });
    accountDisconnected = true;
  }
  return { deletedLeads: deletedCount, accountDisconnected };
}

export async function dataDeletionCallback(req, res) {
  const data = parseSignedRequest(req.body?.signed_request, process.env.IG_APP_SECRET || '');
  if (!data?.user_id) return res.status(400).json({ error: 'signed_request inválido' });

  const code = crypto.randomBytes(8).toString('hex').toUpperCase();
  const request = await IgDeletionRequest.create({ confirmation_code: code, ig_user_id: String(data.user_id) });
  try {
    const result = await deleteDataForUser(data.user_id);
    request.status = 'completed';
    request.deleted_leads = result.deletedLeads;
    request.account_disconnected = result.accountDisconnected;
    request.completed_at = new Date();
  } catch (err) {
    request.status = 'failed';
    request.error = err.message;
  }
  await request.save();
  return res.json({ url: crmUrl(`/api/instagram/data-deletion/status?code=${code}`), confirmation_code: code });
}

export async function dataDeletionStatus(req, res) {
  const code = String(req.query.code || '').trim().toUpperCase();
  const request = code ? await IgDeletionRequest.findOne({ confirmation_code: code }).lean() : null;
  const statusText = !request
    ? 'No encontramos una solicitud con ese código.'
    : request.status === 'completed'
      ? `Completada el ${new Date(request.completed_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. Eliminamos todos los datos de Instagram asociados a tu cuenta.`
      : request.status === 'failed'
        ? 'Hubo un problema procesando la solicitud. Escribinos y la completamos manualmente.'
        : 'Recibida. La estamos procesando.';
  res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Estado de eliminación de datos · Silvia Fernández Propiedades</title>
<style>body{font-family:system-ui,sans-serif;background:#f8faf9;color:#16241d;margin:0;padding:40px 16px}main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6ece8;border-radius:14px;padding:28px}h1{font-size:20px;margin:0 0 12px;color:#15784f}code{background:#e7f4ee;padding:2px 8px;border-radius:6px}p{line-height:1.55}a{color:#15784f}</style></head>
<body><main><h1>Estado de tu solicitud de eliminación de datos</h1>
<p>Código de confirmación: <code>${escapeHtml(code || '—')}</code></p>
<p><strong>${escapeHtml(statusText)}</strong></p>
<p>Más información en <a href="https://www.silviafernandezpropiedades.com.ar/eliminacion-de-datos">silviafernandezpropiedades.com.ar/eliminacion-de-datos</a>.</p>
</main></body></html>`);
}

// ── Panel (solo SUPERADMIN) ─────────────────────────────────────────────────────────────────────

export async function getStatus(req, res, next) {
  try {
    const account = await ig.getAccount();
    const config = await getConfig();
    const counts = await IgLead.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    res.json({
      connected: !!account,
      account: account ? {
        username: account.username,
        ig_user_id: account.ig_user_id,
        account_type: account.account_type,
        permissions: account.permissions,
        expires_at: account.expires_at,
        last_refresh_at: account.last_refresh_at,
        last_refresh_error: account.last_refresh_error,
        webhook_subscribed: account.webhook_subscribed,
        subscribed_fields: account.subscribed_fields,
        subscribe_error: account.subscribe_error,
        connected_at: account.connected_at,
        connected_by: account.connected_by,
      } : null,
      enabled: config.enabled,
      leadCounts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    });
  } catch (err) { next(err); }
}

export async function disconnect(req, res, next) {
  try {
    await ig.disconnect();
    await IgConfig.updateOne({ _id: 'global' }, { $set: { enabled: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function refreshToken(req, res) {
  try {
    res.json(await ig.refreshToken({ force: true }));
  } catch (err) {
    res.status(502).json({ message: `Error renovando el token: ${err.message}` });
  }
}

export async function subscribe(req, res) {
  try {
    res.json(await ig.subscribeWebhooks());
  } catch (err) {
    res.status(502).json({ message: `Error suscribiendo webhooks: ${ig.metaError(err)}` });
  }
}

export async function getConfigHandler(req, res, next) {
  try {
    res.json(await getConfig());
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    await getConfig();
    const { enabled, rules, propertyLinkTemplate, publicReplyEnabled, publicReplies } = req.body || {};
    const set = {};
    if (enabled !== undefined) set.enabled = !!enabled;
    if (publicReplyEnabled !== undefined) set.publicReplyEnabled = !!publicReplyEnabled;
    if (propertyLinkTemplate !== undefined) set.propertyLinkTemplate = String(propertyLinkTemplate);
    if (req.body?.saleContactLine !== undefined) set.saleContactLine = String(req.body.saleContactLine);
    if (Array.isArray(publicReplies)) set.publicReplies = publicReplies.slice(0, 3).map((t) => String(t || ''));
    if (Array.isArray(rules)) {
      set.rules = rules.map((r, i) => ({
        key: String(r.key || `regla${i + 1}`).trim(),
        label: String(r.label || r.key || '').trim(),
        keywords: (Array.isArray(r.keywords) ? r.keywords : String(r.keywords || '').split(','))
          .map((k) => String(k).trim()).filter(Boolean),
        message: String(r.message || ''),
        active: r.active !== false,
      }));
    }
    const config = await IgConfig.findByIdAndUpdate('global', { $set: set }, { new: true }).lean();
    if (set.enabled !== undefined) {
      await Activity.create({ type: 'instagram_toggle', description: `${req.user?.name} ${set.enabled ? 'encendió' : 'apagó'} la automatización de Instagram DM`, userId: req.user?.id, userName: req.user?.name, entityType: 'instagram' }).catch(() => {});
    }
    res.json(config);
  } catch (err) { next(err); }
}

export async function listLeads(req, res, next) {
  try {
    const { status, rule, search, propertyId, from, to, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (rule) filter.rule_key = rule;
    if (propertyId) filter.property_id = parseInt(propertyId, 10);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    if (search) {
      const rx = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      filter.$or = [{ ig_username: rx }, { comment_text: rx }];
    }
    const result = await IgLead.paginate(filter, { page: Number(page), limit: Math.min(Number(limit) || 25, 100), sort: { createdAt: -1 }, lean: true });
    const ids = [...new Set(result.docs.map((d) => d.property_id).filter(Boolean))];
    const props = ids.length ? await Property.find({ id: { $in: ids } }, { id: 1, publication_title: 1, address: 1 }).lean() : [];
    const byId = Object.fromEntries(props.map((p) => [p.id, p]));
    result.docs = result.docs.map((d) => ({
      ...d,
      property: d.property_id ? { id: d.property_id, title: byId[d.property_id]?.publication_title || byId[d.property_id]?.address || '', url: propertyUrl(d.property_id) } : null,
    }));
    res.json(result);
  } catch (err) { next(err); }
}

export async function retryLead(req, res, next) {
  try {
    const lead = await IgLead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead no encontrado' });
    if (lead.status === 'sent') return res.status(400).json({ message: 'Ese DM ya fue enviado' });
    lead.status = 'pending';
    lead.skip_reason = undefined;
    lead.attempts = 0;
    lead.next_attempt_at = new Date(Date.now() + 10 * 60e3);
    await lead.save();
    await attemptSend(lead._id);
    res.json(await IgLead.findById(lead._id).lean());
  } catch (err) { next(err); }
}

export async function deleteLead(req, res, next) {
  try {
    await IgLead.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function listMedia(req, res) {
  try {
    const data = await ig.listMedia({ limit: Math.min(Number(req.query.limit) || 30, 50), after: req.query.after });
    const media = data.data || [];
    const maps = await IgMediaMap.find({ media_id: { $in: media.map((m) => m.id) } }).lean();
    const byMedia = Object.fromEntries(maps.map((m) => [m.media_id, m]));
    const ids = [...new Set(maps.map((m) => m.property_id).filter(Boolean))];
    const props = ids.length ? await Property.find({ id: { $in: ids } }, { id: 1, publication_title: 1, address: 1, 'operations.operation_type': 1 }).lean() : [];
    const config = await getConfig();
    const byId = Object.fromEntries(props.map((p) => [p.id, p]));
    res.json({
      data: media.map((m) => {
        const map = byMedia[m.id];
        const pid = map?.property_id;
        const isSale = !!pid && (byId[pid]?.operations || []).some((o) => /venta/i.test(o.operation_type || ''));
        return {
          ...m,
          property: pid ? { id: pid, title: byId[pid]?.publication_title || byId[pid]?.address || '', sale: isSale } : null,
          custom_message: map?.custom_message || '',
          default_message: defaultPostMessage(config, isSale),
        };
      }),
      paging: data.paging,
    });
  } catch (err) {
    res.status(502).json({ message: `Error listando posts: ${ig.metaError(err)}` });
  }
}

export async function setMediaProperty(req, res, next) {
  try {
    const { mediaId } = req.params;
    const { propertyId, permalink, caption, thumbnail_url: thumbnailUrl, media_product_type: productType } = req.body || {};
    if (propertyId === null || propertyId === '' || propertyId === undefined) {
      // Si el post tiene mensaje propio, se conserva y solo se quita la propiedad
      const existing = await IgMediaMap.findOne({ media_id: mediaId }).lean();
      if (existing?.custom_message) await IgMediaMap.updateOne({ media_id: mediaId }, { $unset: { property_id: 1 } });
      else await IgMediaMap.deleteOne({ media_id: mediaId });
      return res.json({ ok: true, property: null, default_message: defaultPostMessage(await getConfig(), false) });
    }
    const pid = parseInt(propertyId, 10);
    const property = await Property.findOne({ id: pid }, { id: 1, publication_title: 1, address: 1, 'operations.operation_type': 1 }).lean();
    if (!property) return res.status(404).json({ message: `No existe la propiedad #${propertyId}` });
    await IgMediaMap.findOneAndUpdate(
      { media_id: mediaId },
      { $set: { property_id: pid, permalink, caption: caption ? String(caption).slice(0, 500) : undefined, thumbnail_url: thumbnailUrl, media_product_type: productType } },
      { upsert: true },
    );
    // Los leads ya recibidos de ese post quedan vinculados también
    await IgLead.updateMany({ media_id: mediaId }, { $set: { property_id: pid, permalink } });
    const isSale = (property.operations || []).some((o) => /venta/i.test(o.operation_type || ''));
    return res.json({ ok: true, property: { id: pid, title: property.publication_title || property.address || '', sale: isSale }, default_message: defaultPostMessage(await getConfig(), isSale) });
  } catch (err) { return next(err); }
}

// Mensaje propio de un post. Vacío = vuelve al mensaje de la regla.
export async function setMediaMessage(req, res, next) {
  try {
    const { mediaId } = req.params;
    const { message, permalink, caption, thumbnail_url: thumbnailUrl, media_product_type: productType } = req.body || {};
    const text = String(message || '').trim();
    const existing = await IgMediaMap.findOne({ media_id: mediaId }).lean();
    if (!text) {
      if (existing && !existing.property_id) await IgMediaMap.deleteOne({ media_id: mediaId });
      else if (existing) await IgMediaMap.updateOne({ media_id: mediaId }, { $unset: { custom_message: 1 } });
      return res.json({ ok: true, custom_message: '' });
    }
    await IgMediaMap.findOneAndUpdate(
      { media_id: mediaId },
      { $set: { custom_message: text, ...(existing ? {} : { permalink, caption: caption ? String(caption).slice(0, 500) : undefined, thumbnail_url: thumbnailUrl, media_product_type: productType }) } },
      { upsert: true },
    );
    return res.json({ ok: true, custom_message: text });
  } catch (err) { return next(err); }
}

export async function searchProperties(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const filter = {};
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      const or = [{ publication_title: rx }, { address: rx }];
      const num = parseInt(q, 10);
      if (!Number.isNaN(num)) or.push({ id: num });
      filter.$or = or;
    }
    const props = await Property.find(filter, { id: 1, publication_title: 1, address: 1, 'operations.operation_type': 1 }).sort({ updatedAt: -1 }).limit(15).lean();
    res.json(props.map((p) => ({ id: p.id, title: p.publication_title || p.address || '', address: p.address, operation: p.operations?.[0]?.operation_type })));
  } catch (err) { next(err); }
}
