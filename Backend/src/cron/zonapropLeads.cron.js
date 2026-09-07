import cron from 'node-cron';
import { pollZonapropLeads } from '../controllers/zonaprop.controller.js';

// Fallback a Callbacks: la cuenta de ZonaProp es plan "API Free" (confirmado 2026-09-03), que no
// incluye webhooks en tiempo real. Cada 15 min se consulta /v2/.../mensajes de las últimas 48hs
// (ventana con margen por si el server estuvo caído) y se crean los Leads nuevos, con mail — acá
// SÍ son contactos recientes, a diferencia del backfill histórico manual (ver pollZonapropLeads).
export function startZonapropLeadsCron() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const summary = await pollZonapropLeads({ sinceDays: 2, notify: true });
      if (summary.created > 0) console.log(`[zp-leads] ${summary.created} leads nuevos (de ${summary.total} contactos)`);
    } catch (err) {
      console.error('[zp-leads] Error en el polling de leads', err.message);
    }
  });
}
