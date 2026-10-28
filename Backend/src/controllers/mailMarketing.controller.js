import Lead from '../models/Lead.model.js';
import Property from '../models/Property.model.js';
import MailCampaign from '../models/MailCampaign.model.js';
import MailSend from '../models/MailSend.model.js';
import MailSuppression from '../models/MailSuppression.model.js';
import {
  getMailSettings, updateMailSettings, getSmtpInfo, httpError, cleanFilters, resolveAudience, buildCampaignBody,
  renderMessage, sendMessage, normalizeEmail, isValidEmail, smtpErrorText, classifySmtpError, VARIABLES, DEFAULT_FROM_NAME,
  verifyUnsubscribe, registerUnsubscribe,
} from '../utils/mailMarketing.service.js';
import { wakeMailWorker, recomputeStats, getQuotaInfo } from '../cron/mailMarketing.cron.js';
import { SITE_URL, propertyImageUrl, propertyPriceLine } from '../utils/email.util.js';

const EDITABLE_CONTENT = ['name', 'subject', 'preheader', 'fromName', 'html', 'editorMode'];

function pickCampaignPatch(body, status) {
  const patch = {};
  EDITABLE_CONTENT.forEach((k) => { if (body[k] !== undefined) patch[k] = String(body[k] ?? ''); });
  if (patch.editorMode && !['visual', 'html'].includes(patch.editorMode)) delete patch.editorMode;
  // Los destinatarios se congelan al enviar: después ya no se pueden cambiar los filtros
  if (status === 'draft') {
    if (body.filters !== undefined) patch.filters = cleanFilters(body.filters);
    if (body.includeEmails !== undefined) patch.includeEmails = (body.includeEmails || []).map(normalizeEmail).filter(Boolean);
  }
  return patch;
}

const LIST_FIELDS = { html: 0, events: 0 };

// ── Configuración ────────────────────────────────────────────────────────────────────────────────
export async function getConfig(req, res, next) {
  try {
    const [settings, quota, suppressed] = await Promise.all([
      getMailSettings(),
      getQuotaInfo(),
      MailSuppression.aggregate([{ $group: { _id: '$reason', n: { $sum: 1 } } }]),
    ]);
    res.json({
      settings: { ...settings, testEmail: settings.testEmail || req.user?.email || '' },
      smtp: getSmtpInfo(),
      quota,
      suppressed: Object.fromEntries(suppressed.map((r) => [r._id, r.n])),
      variables: VARIABLES,
      defaultFromName: DEFAULT_FROM_NAME,
    });
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    res.json({ settings: await updateMailSettings(req.body || {}) });
  } catch (err) { next(err); }
}

// ── Destinatarios ────────────────────────────────────────────────────────────────────────────────
export async function getFilterOptions(_req, res, next) {
  try {
    const base = { email: { $exists: true, $nin: [null, ''] } };
    const [statuses, sources, byProperty] = await Promise.all([
      Lead.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Lead.aggregate([{ $match: base }, { $group: { _id: '$source', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Lead.aggregate([{ $match: { ...base, propertyId: { $ne: null } } }, { $group: { _id: '$propertyId', n: { $sum: 1 }, title: { $last: '$propertyTitle' } } }]),
    ]);
    const props = await Property.find({ id: { $in: byProperty.map((p) => p._id) } }, { id: 1, 'location.name': 1, publication_title: 1, address: 1 }).lean();
    const propById = new Map(props.map((p) => [p.id, p]));
    const zones = {};
    const properties = byProperty.map((row) => {
      const p = propById.get(row._id);
      const zone = p?.location?.name?.trim();
      // Misma zona con distintas mayúsculas en Tokko: se agrupa por minúsculas y se muestra la primera variante
      if (zone) {
        const k = zone.toLowerCase();
        zones[k] = { key: zones[k]?.key || zone, count: (zones[k]?.count || 0) + row.n };
      }
      return { id: row._id, title: p?.publication_title || p?.address || row.title || `#${row._id}`, zone: zone || '', leads: row.n };
    }).sort((a, b) => b.leads - a.leads);
    res.json({
      statuses: statuses.map((r) => ({ key: r._id, count: r.n })),
      sources: sources.map((r) => ({ key: r._id, count: r.n })),
      zones: Object.values(zones).sort((a, b) => b.count - a.count),
      properties,
    });
  } catch (err) { next(err); }
}

function audienceSummary({ recipients, excluded, leadsMatched }) {
  return {
    count: recipients.length,
    leadsMatched,
    excluded: { ...excluded, invalidCount: excluded.invalid.length },
    sample: recipients.slice(0, 8).map((r) => ({ email: r.email, name: r.name, propertyTitle: r.propertyTitle })),
  };
}

export async function previewAudience(req, res, next) {
  try {
    const audience = await resolveAudience(cleanFilters(req.body?.filters), req.body?.includeEmails || []);
    res.json(audienceSummary(audience));
  } catch (err) { next(err); }
}

export async function searchProperties(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const filter = {};
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      const or = [{ publication_title: rx }, { address: rx }, { 'location.name': rx }];
      const num = parseInt(q, 10);
      if (!Number.isNaN(num)) or.push({ id: num });
      filter.$or = or;
    }
    const props = await Property.find(filter, { id: 1, publication_title: 1, address: 1, location: 1, operations: 1, status: 1, photos: { $slice: 1 } })
      .sort({ updatedAt: -1 }).limit(20).lean();
    res.json(props.map((p) => ({
      id: p.id,
      title: p.publication_title || p.address || `Propiedad #${p.id}`,
      zone: p.location?.name || '',
      price: propertyPriceLine(p),
      image: propertyImageUrl(p),
      url: `${SITE_URL}/propiedad/${p.id}`,
      status: p.status || '',
    })));
  } catch (err) { next(err); }
}

// ── Campañas ─────────────────────────────────────────────────────────────────────────────────────
export async function listCampaigns(_req, res, next) {
  try {
    const campaigns = await MailCampaign.find({}, LIST_FIELDS).sort({ createdAt: -1 }).limit(200).lean();
    // Último evento, para mostrar en el historial el motivo de una pausa o espera
    const last = await MailCampaign.aggregate([
      { $match: { _id: { $in: campaigns.map((c) => c._id) } } },
      { $project: { lastEvent: { $arrayElemAt: ['$events', -1] } } },
    ]);
    const lastById = new Map(last.map((l) => [String(l._id), l.lastEvent]));
    res.json(campaigns.map((c) => ({ ...c, lastEvent: lastById.get(String(c._id)) || null })));
  } catch (err) { next(err); }
}

async function findCampaign(id) {
  const c = await MailCampaign.findById(id).catch(() => null);
  if (!c) throw httpError(404, 'Campaña no encontrada');
  return c;
}

export async function getCampaign(req, res, next) {
  try {
    res.json(await findCampaign(req.params.id));
  } catch (err) { next(err); }
}

export async function createCampaign(req, res, next) {
  try {
    const patch = pickCampaignPatch(req.body || {}, 'draft');
    const c = await MailCampaign.create({
      name: 'Nueva campaña', fromName: DEFAULT_FROM_NAME, ...patch,
      createdBy: req.user?.id, createdByName: req.user?.name,
      events: [{ type: 'info', message: `Borrador creado por ${req.user?.name || 'superadmin'}.` }],
    });
    res.status(201).json(c);
  } catch (err) { next(err); }
}

export async function updateCampaign(req, res, next) {
  try {
    const c = await findCampaign(req.params.id);
    if (!['draft', 'paused'].includes(c.status)) throw httpError(409, 'Solo se pueden editar borradores o campañas pausadas.');
    c.set(pickCampaignPatch(req.body || {}, c.status));
    await c.save();
    res.json(c);
  } catch (err) { next(err); }
}

export async function deleteCampaign(req, res, next) {
  try {
    const c = await findCampaign(req.params.id);
    if (c.status !== 'draft') throw httpError(409, 'Solo se pueden borrar borradores. Las campañas enviadas quedan en el historial.');
    await MailSend.deleteMany({ campaign: c._id });
    await c.deleteOne();
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function duplicateCampaign(req, res, next) {
  try {
    const c = await findCampaign(req.params.id);
    const copy = await MailCampaign.create({
      name: `${c.name || 'Campaña'} (copia)`,
      subject: c.subject, preheader: c.preheader, fromName: c.fromName, html: c.html, editorMode: c.editorMode,
      filters: c.filters, includeEmails: c.includeEmails,
      createdBy: req.user?.id, createdByName: req.user?.name,
      events: [{ type: 'info', message: `Duplicada de "${c.name || c.subject}".` }],
    });
    res.status(201).json(copy);
  } catch (err) { next(err); }
}

// Vista previa del mail tal como llega: usa los datos del borrador que manda el editor (sin guardar)
// y el primer destinatario real del filtro, o un ejemplo si no hay ninguno.
export async function previewCampaign(req, res, next) {
  try {
    const c = await findCampaign(req.params.id);
    const draft = { ...c.toObject(), ...pickCampaignPatch(req.body || {}, c.status) };
    let recipient = null;
    if (req.body?.email) {
      const lead = await Lead.findOne({ email: { $regex: `^${normalizeEmail(req.body.email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }).sort({ createdAt: -1 }).lean();
      if (lead) recipient = { email: normalizeEmail(lead.email), name: lead.name, propertyTitle: lead.propertyTitle };
    }
    if (!recipient) {
      const { recipients } = await resolveAudience(draft.filters || {}, draft.includeEmails || []);
      recipient = recipients[0] || { email: 'ejemplo@gmail.com', name: 'María Pérez', propertyTitle: 'Casa en Mar Azul' };
    }
    const body = await buildCampaignBody(draft.html);
    const msg = renderMessage({ campaign: draft, body, recipient, campaignKey: 'test' });
    res.json({ subject: msg.subject, html: msg.html, text: msg.text, recipient: { email: recipient.email, name: recipient.name, propertyTitle: recipient.propertyTitle } });
  } catch (err) { next(err); }
}

export async function sendTest(req, res, next) {
  try {
    if (!getSmtpInfo().configured) throw httpError(400, 'Falta configurar MKT_SMTP_USER y MKT_SMTP_PASS en el .env del backend (y reiniciarlo).');
    const c = await findCampaign(req.params.id);
    const draft = { ...c.toObject(), ...pickCampaignPatch(req.body || {}, c.status) };
    if (!draft.subject?.trim()) throw httpError(400, 'Falta el asunto.');
    const settings = await getMailSettings();
    const to = normalizeEmail(req.body?.to || settings.testEmail || req.user?.email);
    if (!isValidEmail(to)) throw httpError(400, 'El email de prueba no es válido.');

    // Variables con los datos del primer destinatario real, para ver cómo queda de verdad
    const { recipients } = await resolveAudience(draft.filters || {}, draft.includeEmails || []);
    const sample = recipients[0] || { name: 'María Pérez', propertyTitle: 'Casa en Mar Azul' };
    const body = await buildCampaignBody(draft.html);
    const log = await MailSend.create({ campaign: c._id, isTest: true, email: to, name: sample.name, status: 'sending', lastAttemptAt: new Date(), attempts: 1 });
    try {
      const info = await sendMessage({ campaign: draft, body, recipient: { ...sample, email: to }, campaignKey: 'test', subjectPrefix: '[PRUEBA] ' });
      await MailSend.updateOne({ _id: log._id }, { $set: { status: 'sent', sentAt: new Date(), messageId: info?.messageId } });
    } catch (err) {
      await MailSend.updateOne({ _id: log._id }, { $set: { status: 'failed', error: smtpErrorText(err), errorCode: String(err?.responseCode || err?.code || '') } });
      const kind = classifySmtpError(err);
      throw httpError(502, `${kind === 'pause' ? 'Gmail rechazó el envío (límite, bloqueo o credenciales)' : 'No se pudo enviar la prueba'}: ${smtpErrorText(err)}`);
    }
    await MailCampaign.updateOne({ _id: c._id }, { $set: { lastTestAt: new Date(), lastTestTo: to } });
    res.json({ ok: true, to, sampleName: sample.name || '' });
  } catch (err) { next(err); }
}

export async function startCampaign(req, res, next) {
  try {
    if (!getSmtpInfo().configured) throw httpError(400, 'Falta configurar MKT_SMTP_USER y MKT_SMTP_PASS en el .env del backend (y reiniciarlo).');
    const c = await findCampaign(req.params.id);
    if (c.status !== 'draft') throw httpError(409, 'Esta campaña ya se envió. Duplicala para mandarla de nuevo.');
    if (!c.subject?.trim()) throw httpError(400, 'Falta el asunto.');
    if (!c.html?.replace(/<[^>]+>/g, '').trim() && !/data-property-id|<img/i.test(c.html || '')) throw httpError(400, 'El mail está vacío.');

    const { recipients } = await resolveAudience(c.filters || {}, c.includeEmails || []);
    if (!recipients.length) throw httpError(400, 'No hay destinatarios con estos filtros.');
    const expected = Number(req.body?.expectedCount);
    if (expected !== recipients.length) {
      throw httpError(409, `La cantidad de destinatarios cambió: ahora son ${recipients.length} (confirmaste ${expected || 0}). Revisá el conteo y confirmá de nuevo.`);
    }

    // Se marca 'sending' primero (atómico) para que un doble click no arme la cola dos veces
    const claimed = await MailCampaign.findOneAndUpdate({ _id: c._id, status: 'draft' }, { $set: { status: 'sending', startedAt: new Date() } }, { new: true });
    if (!claimed) throw httpError(409, 'La campaña ya se está enviando.');

    await MailSend.insertMany(recipients.map((r) => ({
      campaign: c._id, email: r.email, lead: r.lead, name: r.name, propertyTitle: r.propertyTitle, status: 'pending',
    })), { ordered: false });
    await recomputeStats(c._id);
    const settings = await getMailSettings();
    const days = Math.ceil(recipients.length / settings.dailyLimit);
    await MailCampaign.updateOne({ _id: c._id }, {
      $push: { events: { type: 'info', message: `Envío iniciado por ${req.user?.name || 'superadmin'}: ${recipients.length} destinatarios. Ritmo: 1 mail cada ${settings.minDelaySec}–${settings.maxDelaySec} s, tope ${settings.dailyLimit}/24 h${days > 1 ? ` (unos ${days} días)` : ''}.` } },
    });
    wakeMailWorker();
    res.json(await MailCampaign.findById(c._id, LIST_FIELDS).lean());
  } catch (err) { next(err); }
}

export async function pauseCampaign(req, res, next) {
  try {
    const c = await MailCampaign.findOneAndUpdate(
      { _id: req.params.id, status: 'sending' },
      { $set: { status: 'paused', autoPaused: false, pauseReason: 'Pausada a mano.' }, $push: { events: { type: 'info', message: `Pausada por ${req.user?.name || 'superadmin'}.` } } },
      { new: true, projection: LIST_FIELDS }
    ).catch(() => null);
    if (!c) throw httpError(409, 'Solo se puede pausar una campaña que se está enviando.');
    res.json(c);
  } catch (err) { next(err); }
}

export async function resumeCampaign(req, res, next) {
  try {
    if (!getSmtpInfo().configured) throw httpError(400, 'Falta configurar MKT_SMTP_USER y MKT_SMTP_PASS en el .env del backend.');
    const c = await MailCampaign.findOneAndUpdate(
      { _id: req.params.id, status: 'paused' },
      { $set: { status: 'sending', autoPaused: false, pauseReason: null }, $push: { events: { type: 'info', message: `Reanudada por ${req.user?.name || 'superadmin'}.` } } },
      { new: true, projection: LIST_FIELDS }
    ).catch(() => null);
    if (!c) throw httpError(409, 'Solo se puede reanudar una campaña pausada.');
    wakeMailWorker();
    res.json(c);
  } catch (err) { next(err); }
}

export async function cancelCampaign(req, res, next) {
  try {
    const c = await MailCampaign.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ['sending', 'paused'] } },
      { $set: { status: 'cancelled', finishedAt: new Date(), waitingUntil: null } },
      { new: true }
    ).catch(() => null);
    if (!c) throw httpError(409, 'Solo se puede cancelar una campaña en envío o pausada.');
    const { modifiedCount } = await MailSend.updateMany({ campaign: c._id, status: 'pending' }, { $set: { status: 'skipped', skipReason: 'Campaña cancelada' } });
    await recomputeStats(c._id);
    await MailCampaign.updateOne({ _id: c._id }, { $push: { events: { type: 'warn', message: `Cancelada por ${req.user?.name || 'superadmin'}. ${modifiedCount} mails pendientes no se enviaron.` } } });
    res.json(await MailCampaign.findById(c._id, LIST_FIELDS).lean());
  } catch (err) { next(err); }
}

export async function listSends(req, res, next) {
  try {
    const c = await findCampaign(req.params.id);
    const filter = { campaign: c._id, isTest: false };
    if (req.query.status) filter.status = req.query.status;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 50;
    const [docs, total] = await Promise.all([
      MailSend.find(filter, { email: 1, name: 1, status: 1, attempts: 1, sentAt: 1, lastAttemptAt: 1, error: 1, errorCode: 1, skipReason: 1, nextAttemptAt: 1 })
        .sort({ lastAttemptAt: -1, createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      MailSend.countDocuments(filter),
    ]);
    res.json({ docs, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) { next(err); }
}

// ── Baja pública (link del mail y List-Unsubscribe one-click) ────────────────────────────────────
function unsubscribePage(title, message, form = '') {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · Silvia Fernández Propiedades</title></head>
<body style="margin:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#22312a;">
<div style="max-width:480px;margin:48px auto;padding:28px;background:#fff;border-radius:14px;border:1px solid #e6ece8;text-align:center;">
<div style="font-weight:bold;color:#15784f;font-size:18px;margin-bottom:18px;">Silvia Fernández Propiedades</div>
<h1 style="font-size:20px;margin:0 0 10px;">${title}</h1>
<p style="font-size:15px;line-height:1.55;color:#4a5b52;margin:0 0 18px;">${message}</p>
${form}
<p style="font-size:13px;margin:18px 0 0;"><a href="${SITE_URL}" style="color:#15784f;">silviafernandezpropiedades.com.ar</a></p>
</div></body></html>`;
}

const invalidLinkPage = () => unsubscribePage('Link inválido', 'Este link de baja no es válido o está incompleto. Si querés dejar de recibir mails, respondé cualquiera de nuestros mails pidiendo la baja.');

// GET: solo muestra el botón (los antivirus y previsualizadores abren los links solos y no tienen
// que dar de baja a nadie). POST: confirma la baja; Gmail usa esto mismo para el one-click.
export function unsubscribeForm(req, res) {
  const email = verifyUnsubscribe(req.query.e, req.query.t);
  if (!email) return res.status(400).type('html').send(invalidLinkPage());
  const action = `?e=${encodeURIComponent(req.query.e)}&c=${encodeURIComponent(req.query.c || '')}&t=${encodeURIComponent(req.query.t)}`;
  return res.type('html').send(unsubscribePage(
    '¿Dejar de recibir mails?',
    `Vamos a dejar de enviar novedades a <strong>${email.replace(/</g, '&lt;')}</strong>. Si tenés una consulta en curso te vamos a seguir contactando por ese tema.`,
    `<form method="POST" action="${action}"><button type="submit" style="background:#15784f;color:#fff;border:none;border-radius:9px;padding:12px 22px;font-size:15px;font-weight:bold;cursor:pointer;">Confirmar baja</button></form>`,
  ));
}

export async function unsubscribeConfirm(req, res) {
  const email = verifyUnsubscribe(req.query.e, req.query.t);
  if (!email) return res.status(400).type('html').send(invalidLinkPage());
  const campaign = String(req.query.c || '');
  if (campaign === 'test') {
    return res.type('html').send(unsubscribePage('Link de prueba', 'Este link vino en un mail de prueba: funciona, pero no se registró ninguna baja.'));
  }
  try {
    await registerUnsubscribe(email, /^[a-f0-9]{24}$/.test(campaign) ? campaign : undefined);
    const affected = await MailSend.distinct('campaign', { email, status: 'pending', isTest: false });
    await MailSend.updateMany({ email, status: 'pending', isTest: false }, { $set: { status: 'skipped', skipReason: 'Se dio de baja' } });
    await Promise.all(affected.map((id) => recomputeStats(id)));
  } catch (err) {
    console.error('[mail-marketing] Error registrando baja:', err.message);
    return res.status(500).type('html').send(unsubscribePage('No pudimos procesar la baja', 'Probá de nuevo en unos minutos o respondé el mail pidiendo la baja.'));
  }
  return res.type('html').send(unsubscribePage('Listo, te diste de baja', 'No vas a recibir más mails de novedades. ¡Gracias!'));
}
