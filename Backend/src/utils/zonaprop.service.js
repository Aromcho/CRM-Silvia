import axios from 'axios';
import ZpToken from '../models/ZpToken.model.js';

// Documentación: open-classifieds.notion.site/arg + Swagger real en {base}/swagger-ui-init.js
// Ver CRM/PLAN_ZONAPROP.md para el plan completo. Este service cubre por ahora solo login +
// cache de token + wrapper de request autenticado (paso 1 del plan).

// Se lee en cada llamada, no una const de módulo: ver [[project_esm_dotenv_order_bug]] —
// los imports ESM se evalúan antes que dotenv.config() en index.js.
function zpApiBase() {
  return (process.env.ZP_API_BASE || '').replace(/\/$/, '');
}

export function codigoInmobiliaria() {
  return process.env.ZP_CODIGO_INMOBILIARIA;
}

async function login() {
  const { data } = await axios.post(`${zpApiBase()}/v1/application/login`, null, {
    params: {
      grant_type: 'client_credentials',
      client_id: process.env.ZP_CLIENT_ID,
      client_secret: process.env.ZP_CLIENT_SECRET,
    },
  });
  // El token dura ~10 años en sandbox (expires_in gigante), pero igual lo tratamos como si
  // pudiera expirar: no cachear "para siempre" sin control (mismo criterio que MlToken).
  const expires_at = new Date(Date.now() + (data.expires_in - 60) * 1000);
  await ZpToken.findOneAndUpdate(
    {},
    { access_token: data.access_token, token_type: data.token_type, scope: data.scope, expires_at },
    { upsert: true, new: true }
  );
  return data.access_token;
}

export async function getValidAccessToken() {
  const token = await ZpToken.findOne({});
  if (token && token.expires_at > new Date(Date.now() + 30_000)) return token.access_token;
  return login();
}

export async function zpRequest(method, path, opts = {}) {
  const access_token = await getValidAccessToken();
  try {
    return await axios({
      method,
      url: `${zpApiBase()}${path}`,
      headers: { Authorization: `Bearer ${access_token}` },
      ...opts,
    });
  } catch (err) {
    // client_credentials no tiene refresh_token: si el token fue revocado/expiró antes de lo
    // esperado, la única recuperación posible es loguearse de nuevo (una vez, no en loop).
    if (err.response?.status === 401) {
      const fresh = await login();
      return axios({
        method,
        url: `${zpApiBase()}${path}`,
        headers: { Authorization: `Bearer ${fresh}` },
        ...opts,
      });
    }
    throw err;
  }
}
