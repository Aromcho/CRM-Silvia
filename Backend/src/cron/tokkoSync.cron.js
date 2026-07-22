import cron from 'node-cron';
import { syncWithTokko } from '../utils/syncWithTokko.js';

// Corre cada 2 minutos: mantiene al CRM como única fuente de verdad de Tokko
// (la web consume esta base vía /api/public/properties en vez de pegarle a Tokko directo).
export function startTokkoSyncCron() {
  cron.schedule('*/2 * * * *', async () => {
    try {
      await syncWithTokko();
    } catch (err) {
      console.error('[tokko-sync] Error en la sincronización automática', err.message);
    }
  });
}
