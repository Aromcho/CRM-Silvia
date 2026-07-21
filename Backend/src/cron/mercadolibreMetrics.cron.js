import cron from 'node-cron';
import { collectDailyMetrics } from '../utils/mercadolibreMetrics.service.js';

// Corre todos los días a las 4am (hora del servidor): trae visitas/preguntas/teléfono/whatsapp/leads
// del día anterior para cada publicación activa en MercadoLibre y guarda el snapshot diario.
export function startMercadoLibreMetricsCron() {
  cron.schedule('0 4 * * *', async () => {
    try {
      const summary = await collectDailyMetrics();
      console.log(`[ml-metrics] ${summary.date}: ${summary.saved}/${summary.itemsProcessed} publicaciones`);
    } catch (err) {
      console.error('[ml-metrics] Error en la recolección diaria', err.message);
    }
  });
}
