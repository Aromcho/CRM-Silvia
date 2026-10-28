import mongoose from 'mongoose';
import MailCampaign from '../models/MailCampaign.model.js';
import MailSend from '../models/MailSend.model.js';
import MailSuppression from '../models/MailSuppression.model.js';
import {
  getMailSettings, getSmtpInfo, buildCampaignBody, sendMessage, classifySmtpError, smtpErrorText, registerBounce,
} from '../utils/mailMarketing.service.js';

// Worker de Mail Marketing: un mail por vuelta, con una espera aleatoria entre vueltas para no
// parecer un robot. Corre dentro de crm-backend (pm2, una sola instancia), así que el envío sigue
// aunque nadie tenga el CRM abierto. No usa node-cron porque el intervalo es variable.
const IDLE_MS = 60e3;
const MAX_WAIT_MS = 10 * 60e3;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MIN = [5, 20, 60];
const DAY_MS = 24 * 3600e3;

let timer = null;
let running = false;
let wakeRequested = false;
const bodyCache = new Map(); // campaignId → { key: html de origen, body }

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(tick, Math.max(1000, ms));
}

// Para que "Enviar" / "Reanudar" arranquen enseguida en vez de esperar la próxima vuelta.
export function wakeMailWorker() {
  if (running) wakeRequested = true;
  else schedule(1000);
}

function randomDelayMs(settings) {
  const min = settings.minDelaySec * 1000;
  const max = Math.max(min, settings.maxDelaySec * 1000);
  return min + Math.random() * (max - min);
}

const fmtAr = (d) => d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

async function addEvent(campaignId, type, message, extra = {}) {
  await MailCampaign.updateOne({ _id: campaignId }, { $push: { events: { at: new Date(), type, message } }, $set: extra });
}

export async function recomputeStats(campaignId) {
  const rows = await MailSend.aggregate([
    { $match: { campaign: campaignId, isTest: false } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  const total = rows.reduce((a, r) => a + r.n, 0);
  await MailCampaign.updateOne({ _id: campaignId }, { $set: { stats: { total, sent: by.sent || 0, failed: by.failed || 0, skipped: by.skipped || 0 } } });
}

// Cupo de Gmail en ventana móvil de 24 h: cuenta cada intento que llegó al SMTP (pruebas incluidas).
async function quotaState(settings) {
  const since = new Date(Date.now() - DAY_MS);
  const used = await MailSend.countDocuments({ lastAttemptAt: { $gte: since } });
  if (used < settings.dailyLimit) return { used, full: false };
  const oldest = await MailSend.findOne({ lastAttemptAt: { $gte: since } }, { lastAttemptAt: 1 }).sort({ lastAttemptAt: 1 }).lean();
  return { used, full: true, resumeAt: new Date(oldest.lastAttemptAt.getTime() + DAY_MS + 60e3) };
}

export async function getQuotaInfo() {
  const settings = await getMailSettings();
  const q = await quotaState(settings);
  return { used: q.used, limit: settings.dailyLimit, resumeAt: q.resumeAt || null };
}

async function campaignBody(campaign) {
  const key = campaign.html || ''; // no updatedAt: cada $inc de stats lo mueve
  const cached = bodyCache.get(String(campaign._id));
  if (cached && cached.key === key) return cached.body;
  const body = await buildCampaignBody(campaign.html);
  bodyCache.set(String(campaign._id), { key, body });
  return body;
}

async function finishIfDone(campaign) {
  const pending = await MailSend.findOne({ campaign: campaign._id, status: { $in: ['pending', 'sending'] } }, { nextAttemptAt: 1 }).sort({ nextAttemptAt: 1 }).lean();
  if (pending) {
    // Solo quedan reintentos programados más adelante
    return pending.nextAttemptAt ? Math.min(MAX_WAIT_MS, pending.nextAttemptAt.getTime() - Date.now()) : 5000;
  }
  await recomputeStats(campaign._id);
  const fresh = await MailCampaign.findById(campaign._id, { stats: 1 }).lean();
  await addEvent(campaign._id, 'info', `Campaña finalizada: ${fresh.stats.sent} enviados, ${fresh.stats.failed} fallidos, ${fresh.stats.skipped} omitidos.`, {
    status: 'finished', finishedAt: new Date(), waitingUntil: null,
  });
  bodyCache.delete(String(campaign._id));
  return 2000;
}

async function processNext() {
  const campaign = await MailCampaign.findOne({ status: 'sending' }).sort({ startedAt: 1 });
  if (!campaign) return IDLE_MS;

  if (!getSmtpInfo().configured) {
    await addEvent(campaign._id, 'error', 'Pausada: falta MKT_SMTP_USER / MKT_SMTP_PASS en el .env del backend.', {
      status: 'paused', autoPaused: true, pauseReason: 'Falta configurar la cuenta de envío (MKT_SMTP_USER / MKT_SMTP_PASS).',
    });
    return 2000;
  }

  const settings = await getMailSettings();
  const quota = await quotaState(settings);
  if (quota.full) {
    // La ventana es móvil: al retomar se libera de a un lugar por vez, así que el aviso se registra
    // como mucho una vez cada 12 h para no llenar el historial.
    const lastQuotaEvent = [...(campaign.events || [])].reverse().find((ev) => ev.message?.startsWith('Tope diario'));
    if (!lastQuotaEvent || Date.now() - lastQuotaEvent.at.getTime() > 12 * 3600e3) {
      await addEvent(campaign._id, 'warn', `Tope diario alcanzado (${settings.dailyLimit} mails en 24 h). Sigue solo a partir del ${fmtAr(quota.resumeAt)} hs`, { waitingUntil: quota.resumeAt });
    } else {
      await MailCampaign.updateOne({ _id: campaign._id }, { $set: { waitingUntil: quota.resumeAt } });
    }
    return Math.min(MAX_WAIT_MS, quota.resumeAt.getTime() - Date.now());
  }
  if (campaign.waitingUntil) await MailCampaign.updateOne({ _id: campaign._id }, { $set: { waitingUntil: null } });

  const now = new Date();
  const send = await MailSend.findOneAndUpdate(
    { campaign: campaign._id, isTest: false, status: 'pending', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
    { $set: { status: 'sending' } },
    { sort: { createdAt: 1 }, new: true }
  );
  if (!send) return finishIfDone(campaign);

  // Se pudo haber dado de baja (o rebotado en otra campaña) desde que se armó la cola
  const suppression = await MailSuppression.findOne({ email: send.email }, { reason: 1 }).lean();
  if (suppression) {
    await MailSend.updateOne({ _id: send._id }, { $set: { status: 'skipped', skipReason: suppression.reason === 'unsubscribed' ? 'Se dio de baja' : 'Email inválido (rebotó antes)' } });
    await MailCampaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.skipped': 1 } });
    return 500;
  }

  const body = await campaignBody(campaign);
  const attemptAt = new Date();
  try {
    const info = await sendMessage({ campaign, body, recipient: send, campaignKey: String(campaign._id) });
    await MailSend.updateOne({ _id: send._id }, {
      $set: { status: 'sent', sentAt: new Date(), lastAttemptAt: attemptAt, messageId: info?.messageId, error: null, errorCode: null },
      $inc: { attempts: 1 },
    });
    await MailCampaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.sent': 1 } });
  } catch (err) {
    const kind = classifySmtpError(err);
    const errorText = smtpErrorText(err);
    const errorCode = String(err?.responseCode || err?.code || '');
    console.error(`[mail-marketing] ${send.email}: ${kind} ${errorCode} ${errorText}`);

    if (kind === 'pause') {
      // El destinatario no tiene la culpa: vuelve a la cola tal cual y se frena todo
      await MailSend.updateOne({ _id: send._id }, { $set: { status: 'pending', lastAttemptAt: attemptAt, error: errorText, errorCode }, $inc: { attempts: 1 } });
      const reason = `Gmail respondió ${errorCode || 'con un error'}: ${errorText.replace(/\.?\s*$/, '.')}`;
      await addEvent(campaign._id, 'error', `Pausada automáticamente. ${reason} Revisá la cuenta antes de reanudar.`, {
        status: 'paused', autoPaused: true, pauseReason: reason,
      });
      return 2000;
    }

    const attempts = (send.attempts || 0) + 1;
    if (kind === 'permanent' || attempts >= MAX_ATTEMPTS) {
      await MailSend.updateOne({ _id: send._id }, { $set: { status: 'failed', lastAttemptAt: attemptAt, error: errorText, errorCode, attempts } });
      await MailCampaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.failed': 1 } });
      if (kind === 'permanent') await registerBounce(send.email, errorText, campaign._id);
    } else {
      const retryAt = new Date(Date.now() + RETRY_BACKOFF_MIN[attempts - 1] * 60e3);
      await MailSend.updateOne({ _id: send._id }, { $set: { status: 'pending', lastAttemptAt: attemptAt, error: errorText, errorCode, attempts, nextAttemptAt: retryAt } });
    }
  }
  return randomDelayMs(settings);
}

async function tick() {
  running = true;
  let next = IDLE_MS;
  try {
    next = await processNext();
  } catch (err) {
    console.error('[mail-marketing] Error en el worker:', err);
    next = IDLE_MS;
  } finally {
    running = false;
    schedule(wakeRequested ? 1000 : next);
    wakeRequested = false;
  }
}

export async function startMailMarketingWorker() {
  // Un reinicio en medio de un envío deja ese mail en 'sending': no se sabe si Gmail lo aceptó,
  // así que se marca fallido en vez de reintentarlo (mejor perder uno que mandarlo dos veces).
  try {
    const stuck = await MailSend.find({ status: 'sending' }, { campaign: 1 }).lean();
    if (stuck.length) {
      await MailSend.updateMany({ status: 'sending' }, { $set: { status: 'failed', error: 'Se reinició el servidor durante el envío (puede haber salido o no). No se reintenta para no duplicarlo.' } });
      const ids = [...new Set(stuck.filter((s) => s.campaign).map((s) => String(s.campaign)))];
      await Promise.all(ids.map((id) => recomputeStats(new mongoose.Types.ObjectId(id))));
    }
  } catch (err) {
    console.error('[mail-marketing] Error recuperando envíos interrumpidos:', err.message);
  }
  schedule(10e3);
}
