import axios from 'axios';

// Trae las estadísticas de consultas por WhatsApp que registra el backend de la web pública
// (web-silvia-next), donde vive la rotación de agentes y el log de clicks. El CRM no duplica
// esos datos, solo los expone acá para mostrarlos en Reportes.
export async function getWhatsAppStats(req, res, next) {
  try {
    const baseUrl = process.env.WEB_API_URL || 'http://localhost:3001';
    const { from, to } = req.query;

    const { data } = await axios.get(`${baseUrl}/api/whatsapp/stats`, {
      params: { from, to },
      headers: { 'x-stats-key': process.env.WEB_WHATSAPP_STATS_KEY || '' },
      timeout: 10000,
    });

    res.json(data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({ message: 'No se pudieron obtener las estadísticas de WhatsApp de la web' });
    }
    next(err);
  }
}
