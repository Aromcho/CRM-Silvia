import cron from 'node-cron';
import { reconcileExistingListings } from '../utils/zonaprop.service.js';

// Corre todos los días a las 5am (hora del servidor): re-vincula avisos que ya existen en ZonaProp
// con propiedades del CRM que todavía no tengan codigoAviso guardado — idempotente, no pisa nada
// ya vinculado (ver zonaprop.service.js reconcileExistingListings). Cubre altas nuevas del lado de
// ZonaProp que no llegaron por callback (o mientras los callbacks todavía no están configurados).
export function startZonapropReconcileCron() {
  cron.schedule('0 5 * * *', async () => {
    try {
      const summary = await reconcileExistingListings();
      console.log(`[zp-reconcile] ${summary.linked} nuevos, ${summary.alreadyLinked} ya vinculados, ${summary.unmatched.length} sin match (de ${summary.total})`);
    } catch (err) {
      console.error('[zp-reconcile] Error en la reconciliación diaria', err.message);
    }
  });
}
