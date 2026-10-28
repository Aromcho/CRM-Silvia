import axios from 'axios';
import IgAccount from '../models/IgAccount.model.js';

// Instagram API con inicio de sesión con Instagram (graph.instagram.com, NO Facebook Login).
// Docs: developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
export const IG_API_VERSION = process.env.IG_API_VERSION || 'v26.0';
const GRAPH = `https://graph.instagram.com/${IG_API_VERSION}`;
export const IG_SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments', 'instagram_business_manage_messages'];
export const WEBHOOK_FIELDS = ['comments', 'messages'];

// Error de Meta legible para logs/panel (el body trae { error: { message, type, code, error_subcode, fbtrace_id } })
export function metaError(err) {
  const data = err.response?.data;
  if (data?.error) return JSON.stringify(data.error);
  if (data) return typeof data === 'string' ? data : JSON.stringify(data);
  return err.message;
}

// Errores en los que conviene reintentar: red, 5xx, rate limits y los que Meta marca transitorios.
export function isRetryable(err) {
  if (!err.response) return true;
  if (err.response.status >= 500 || err.response.status === 429) return true;
  const e = err.response.data?.error || {};
  return e.is_transient === true || [1, 2, 4, 17, 32, 613].includes(e.code);
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    redirect_uri: process.env.IG_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: IG_SCOPES.join(','),
    state,
    enable_fb_login: 'false',
    force_reauth: 'true',
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

// code → token corto → token de larga duración (60 días) → /me. Guarda todo en Mongo.
export async function connectWithCode(code, connectedBy) {
  const cleanCode = String(code).replace(/#_$/, '');
  const form = new URLSearchParams({
    client_id: process.env.IG_APP_ID,
    client_secret: process.env.IG_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: process.env.IG_OAUTH_REDIRECT_URI,
    code: cleanCode,
  });
  const { data: shortRes } = await axios.post('https://api.instagram.com/oauth/access_token', form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  // La doc muestra { data: [{ access_token, user_id, permissions }] }; en la práctica a veces viene plano.
  const short = Array.isArray(shortRes?.data) ? shortRes.data[0] : shortRes;
  if (!short?.access_token) throw new Error(`Respuesta inesperada al canjear el code: ${JSON.stringify(shortRes)}`);

  const { data: long } = await axios.get('https://graph.instagram.com/access_token', {
    params: { grant_type: 'ig_exchange_token', client_secret: process.env.IG_APP_SECRET, access_token: short.access_token },
  });

  const { data: me } = await axios.get(`${GRAPH}/me`, {
    params: { fields: 'user_id,username,account_type', access_token: long.access_token },
  });

  const permissions = Array.isArray(short.permissions)
    ? short.permissions
    : String(short.permissions || '').split(',').map((p) => p.trim()).filter(Boolean);

  const now = new Date();
  const account = await IgAccount.findByIdAndUpdate('main', {
    $set: {
      access_token: long.access_token,
      ig_user_id: String(me.user_id),
      app_scoped_id: String(me.id || short.user_id || ''),
      username: me.username,
      account_type: me.account_type,
      permissions,
      token_issued_at: now,
      expires_at: new Date(now.getTime() + (long.expires_in || 5184000) * 1000),
      last_refresh_at: now,
      last_refresh_error: null,
      connected_at: now,
      connected_by: connectedBy || null,
    },
  }, { upsert: true, new: true });

  try {
    await subscribeWebhooks(account);
  } catch (err) {
    console.error('[instagram] No se pudo suscribir a webhooks:', metaError(err));
  }
  return IgAccount.findById('main').lean();
}

export async function getAccount() {
  return IgAccount.findById('main').lean();
}

export async function subscribeWebhooks(account) {
  const acc = account || await getAccount();
  if (!acc) throw new Error('Instagram no está conectado');
  try {
    const { data } = await axios.post(`${GRAPH}/${acc.ig_user_id}/subscribed_apps`, null, {
      params: { subscribed_fields: WEBHOOK_FIELDS.join(','), access_token: acc.access_token },
    });
    await IgAccount.updateOne({ _id: 'main' }, { $set: { webhook_subscribed: data?.success === true, subscribed_fields: WEBHOOK_FIELDS, subscribe_error: null } });
    return data;
  } catch (err) {
    await IgAccount.updateOne({ _id: 'main' }, { $set: { webhook_subscribed: false, subscribe_error: metaError(err) } });
    throw err;
  }
}

export async function disconnect() {
  const acc = await getAccount();
  if (!acc) return;
  try {
    await axios.delete(`${GRAPH}/${acc.ig_user_id}/subscribed_apps`, { params: { access_token: acc.access_token } });
  } catch (err) {
    console.error('[instagram] Error al desuscribir webhooks (se desconecta igual):', metaError(err));
  }
  await IgAccount.deleteOne({ _id: 'main' });
}

// Renueva el token de larga duración (requiere >24 h de antigüedad y que no haya vencido).
export async function refreshToken({ force = false } = {}) {
  const acc = await getAccount();
  if (!acc) return { refreshed: false, reason: 'not_connected' };
  const ageMs = Date.now() - new Date(acc.token_issued_at || acc.updatedAt).getTime();
  if (!force && ageMs < 24 * 3600 * 1000) return { refreshed: false, reason: 'token_too_new' };
  try {
    const { data } = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: { grant_type: 'ig_refresh_token', access_token: acc.access_token },
    });
    const now = new Date();
    await IgAccount.updateOne({ _id: 'main' }, {
      $set: {
        access_token: data.access_token,
        token_issued_at: now,
        expires_at: new Date(now.getTime() + (data.expires_in || 5184000) * 1000),
        last_refresh_at: now,
        last_refresh_error: null,
      },
    });
    return { refreshed: true };
  } catch (err) {
    const msg = metaError(err);
    await IgAccount.updateOne({ _id: 'main' }, { $set: { last_refresh_error: msg } });
    throw new Error(msg);
  }
}

export async function listMedia({ limit = 30, after } = {}) {
  const acc = await getAccount();
  if (!acc) throw new Error('Instagram no está conectado');
  const { data } = await axios.get(`${GRAPH}/${acc.ig_user_id}/media`, {
    params: {
      fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp',
      limit,
      ...(after ? { after } : {}),
      access_token: acc.access_token,
    },
  });
  return data;
}

export async function getMedia(mediaId) {
  const acc = await getAccount();
  if (!acc) throw new Error('Instagram no está conectado');
  const { data } = await axios.get(`${GRAPH}/${mediaId}`, {
    params: { fields: 'id,permalink,media_product_type', access_token: acc.access_token },
  });
  return data;
}

// Private reply: DM al autor de un comentario. Una por comentario, dentro de los 7 días.
export async function sendPrivateReply(commentId, text) {
  const acc = await getAccount();
  if (!acc) throw new Error('Instagram no está conectado');
  const { data } = await axios.post(`${GRAPH}/${acc.ig_user_id}/messages`, {
    recipient: { comment_id: commentId },
    message: { text },
  }, { headers: { Authorization: `Bearer ${acc.access_token}` } });
  return data;
}

export async function replyToComment(commentId, message) {
  const acc = await getAccount();
  if (!acc) throw new Error('Instagram no está conectado');
  const { data } = await axios.post(`${GRAPH}/${commentId}/replies`, { message }, {
    headers: { Authorization: `Bearer ${acc.access_token}` },
  });
  return data;
}
