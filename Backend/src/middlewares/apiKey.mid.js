export default function apiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.WEB_SYNC_API_KEY) {
    return res.status(401).json({ message: 'API key inválida' });
  }
  return next();
}
