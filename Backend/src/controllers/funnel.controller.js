import Lead from '../models/Lead.model.js';

// Reportes (C7): de dónde vienen las consultas, cómo avanzan y cómo responde cada asesor.
// GET /dashboard/funnel?days=90

const STAGE = {
  nuevo: 'nuevas', en_progreso: 'conversacion', contactado: 'conversacion',
  reservado: 'reserva', cerrado: 'cerradas', descartado: 'descartadas', historico: 'historicas',
};

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function getFunnel(req, res, next) {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 7), 730);
    const since = new Date(Date.now() - days * 86400000);
    const leads = await Lead.find(
      { createdAt: { $gte: since } },
      { source: 1, status: 1, assignedTo: 1, createdAt: 1, lastContactAt: 1, contactLog: 1, propertyId: 1, propertyTitle: 1, 'attribution.channel': 1 },
    ).populate('assignedTo', 'name').lean();

    const bySource = {};
    const byChannel = {};
    const stages = { nuevas: 0, conversacion: 0, reserva: 0, cerradas: 0, descartadas: 0, historicas: 0 };
    const agents = new Map();
    const props = new Map();

    leads.forEach((l) => {
      const src = l.source || 'otro';
      bySource[src] = bySource[src] || { total: 0, avanzaron: 0, cerradas: 0 };
      bySource[src].total += 1;
      const stage = STAGE[l.status] || 'nuevas';
      stages[stage] += 1;
      if (['conversacion', 'reserva', 'cerradas'].includes(stage)) bySource[src].avanzaron += 1;
      if (['reserva', 'cerradas'].includes(stage)) bySource[src].cerradas += 1;

      if (src === 'web') {
        const ch = l.attribution?.channel || 'sin dato';
        byChannel[ch] = (byChannel[ch] || 0) + 1;
      }

      const key = l.assignedTo?._id ? String(l.assignedTo._id) : 'sin-asignar';
      const a = agents.get(key) || { name: l.assignedTo?.name || 'Sin asignar', total: 0, respondidas: 0, cierres: 0, horas: [] };
      a.total += 1;
      const first = (l.contactLog || []).map((c) => new Date(c.at).getTime()).filter(Number.isFinite).sort((x, y) => x - y)[0]
        || (l.lastContactAt ? new Date(l.lastContactAt).getTime() : null);
      if (first) {
        a.respondidas += 1;
        const h = (first - new Date(l.createdAt).getTime()) / 3600000;
        if (h >= 0 && h < 24 * 30) a.horas.push(h);
      }
      if (['reserva', 'cerradas'].includes(stage)) a.cierres += 1;
      agents.set(key, a);

      if (l.propertyId) {
        const p = props.get(l.propertyId) || { propertyId: l.propertyId, title: l.propertyTitle || '', total: 0, fuentes: {} };
        p.total += 1;
        p.fuentes[src] = (p.fuentes[src] || 0) + 1;
        props.set(l.propertyId, p);
      }
    });

    res.json({
      days,
      total: leads.length,
      stages,
      bySource: Object.entries(bySource).map(([source, v]) => ({ source, ...v })).sort((a, b) => b.total - a.total),
      webChannels: Object.entries(byChannel).map(([channel, total]) => ({ channel, total })).sort((a, b) => b.total - a.total),
      agents: [...agents.values()].map((a) => ({
        name: a.name, total: a.total, respondidas: a.respondidas, cierres: a.cierres,
        medianaHoras: a.horas.length ? Math.round(median(a.horas) * 10) / 10 : null,
      })).sort((a, b) => b.total - a.total),
      topProperties: [...props.values()].sort((a, b) => b.total - a.total).slice(0, 10),
    });
  } catch (error) {
    next(error);
  }
}
