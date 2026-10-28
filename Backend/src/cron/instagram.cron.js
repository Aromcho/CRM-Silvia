import cron from 'node-cron';
import IgAccount from '../models/IgAccount.model.js';
import IgLead from '../models/IgLead.model.js';
import { refreshToken } from '../utils/instagram.service.js';
import { processRetryQueue } from '../utils/instagramProcessor.js';

const REFRESH_WHEN_DAYS_LEFT = 20;
const LEAD_RETENTION_DAYS = 365; // la política de privacidad de la web promete máximo 12 meses

// Token de larga duración de Instagram: dura 60 días y se puede renovar cuando tiene >24 h.
// Todos los días a las 4:00 (hora Argentina) se renueva si le quedan menos de 20 días.
export function startInstagramCron() {
  cron.schedule('0 4 * * *', async () => {
    try {
      const acc = await IgAccount.findById('main').lean();
      if (!acc) return;
      const daysLeft = (new Date(acc.expires_at).getTime() - Date.now()) / 86400e3;
      if (daysLeft > REFRESH_WHEN_DAYS_LEFT) return;
      const result = await refreshToken();
      console.log(`[instagram] Renovación de token: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error('[instagram] Error renovando token:', err.message);
    }
  }, { timezone: 'America/Argentina/Buenos_Aires' });

  // Retención: se borran los leads de Instagram con más de 12 meses
  cron.schedule('30 4 * * *', async () => {
    try {
      const { deletedCount } = await IgLead.deleteMany({ createdAt: { $lt: new Date(Date.now() - LEAD_RETENTION_DAYS * 86400e3) } });
      if (deletedCount) console.log(`[instagram] Retención: ${deletedCount} leads de más de 12 meses borrados`);
    } catch (err) {
      console.error('[instagram] Error en limpieza por retención:', err.message);
    }
  }, { timezone: 'America/Argentina/Buenos_Aires' });

  // Reintentos con backoff de DMs que fallaron por errores transitorios
  cron.schedule('* * * * *', () => {
    processRetryQueue().catch((err) => console.error('[instagram] Error en cola de reintentos:', err.message));
  });
}
