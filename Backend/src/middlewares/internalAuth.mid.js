import crypto from 'crypto';

// Módulo /internal (panel central). Lo consulta solo admin-api, desde el mismo servidor.
// Tres candados: token de servicio (INTERNAL_TOKEN en .env), conexión desde localhost y que el
// pedido no venga reenviado por Nginx (todo lo que entra por un dominio trae X-Forwarded-For /
// X-Real-IP y también llega desde 127.0.0.1, así que mirar la IP sola no alcanza).
// Sin INTERNAL_TOKEN configurado el módulo queda apagado y responde 404, igual que a un extraño.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded'];

function sameToken(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default function internalAuth(req, res, next) {
  const expected = process.env.INTERNAL_TOKEN;
  const local = LOOPBACK.has(req.socket?.remoteAddress) && !PROXY_HEADERS.some((h) => req.headers[h]);
  if (!expected || !local) return res.status(404).json({ message: 'Not found' });
  if (!sameToken(req.headers['x-internal-token'], expected)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return next();
}
