import mongoose from 'mongoose';
import Lead from '../models/Lead.model.js';
import User from '../models/User.model.js';
import Activity from '../models/Activity.model.js';
import { contactKey, stripHtml } from '../utils/contactKey.js';

// Consultas como bandeja (C2): una fila por persona con todas sus consultas, estado que se mueve
// solo al contactar y vistas Mías / Sin asignar / Todas.

export const STAGES = {
  nuevas: ['nuevo'],
  conversacion: ['en_progreso', 'contactado'],
  reserva: ['reservado'],
  cerradas: ['cerrado', 'descartado'],
  historicas: ['historico'],
};
const STAGE_OF_STATUS = Object.fromEntries(Object.entries(STAGES).flatMap(([stage, list]) => list.map((s) => [s, stage])));
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', llamada: 'llamada', email: 'email', portal: 'el portal', nota: 'nota' };
const escapeRx = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isAdmin = (user) => user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

// Completa contactKey en las consultas viejas (antes no existía). Corre una vez al arrancar.
export async function ensureContactKeys() {
  try {
    const missing = await Lead.find({ $or: [{ contactKey: { $exists: false } }, { contactKey: null }, { contactKey: '' }] }, { name: 1, email: 1, phone: 1 }).lean();
    if (!missing.length) return 0;
    for (let i = 0; i < missing.length; i += 500) {
      const chunk = missing.slice(i, i + 500);
      await Lead.bulkWrite(chunk.map((l) => ({ updateOne: { filter: { _id: l._id }, update: { $set: { contactKey: contactKey(l) } } } })));
    }
    console.log(`[leads] contactKey completado en ${missing.length} consultas`);
    return missing.length;
  } catch (err) {
    console.error('[leads] No se pudo completar contactKey:', err.message);
    return 0;
  }
}

function baseMatch(req, { withStage = true } = {}) {
  const { view = 'all', stage = 'nuevas', q, source, dateFrom, dateTo, assignedTo } = req.query;
  const match = {};
  if (withStage && STAGES[stage]) match.status = { $in: STAGES[stage] };
  if (view === 'mine' && req.user?.id) match.assignedTo = new mongoose.Types.ObjectId(req.user.id);
  else if (view === 'unassigned') match.assignedTo = null;
  else if (assignedTo && mongoose.isValidObjectId(assignedTo)) match.assignedTo = new mongoose.Types.ObjectId(assignedTo);
  if (source && source !== 'all') match.source = source;
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(`${dateFrom}T00:00:00.000-03:00`);
    if (dateTo) match.createdAt.$lte = new Date(`${dateTo}T23:59:59.999-03:00`);
  }
  if (q && String(q).trim()) {
    const rx = { $regex: escapeRx(String(q).trim()), $options: 'i' };
    const or = [{ name: rx }, { email: rx }, { phone: rx }, { propertyTitle: rx }];
    const asNumber = parseInt(String(q).replace(/\D/g, ''), 10);
    if (Number.isFinite(asNumber) && String(q).replace(/\D/g, '').length >= 5) or.push({ propertyId: asNumber });
    match.$or = or;
  }
  return match;
}

async function userNames(ids) {
  const valid = [...new Set(ids.filter(Boolean).map(String))];
  if (!valid.length) return {};
  const users = await User.find({ _id: { $in: valid } }, { name: 1 }).lean();
  return Object.fromEntries(users.map((u) => [String(u._id), u.name]));
}

// GET /leads/inbox
export async function getInbox(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const match = baseMatch(req);

    const [result] = await Lead.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { $ifNull: ['$contactKey', { $toString: '$_id' }] },
          name: { $first: '$name' },
          emails: { $addToSet: '$email' },
          phones: { $addToSet: '$phone' },
          count: { $sum: 1 },
          lastAt: { $max: '$createdAt' },
          firstAt: { $min: '$createdAt' },
          sources: { $addToSet: '$source' },
          titles: { $push: '$propertyTitle' },
          statuses: { $addToSet: '$status' },
          assignedTo: { $first: '$assignedTo' },
          lastContactAt: { $max: '$lastContactAt' },
          lastMessage: { $first: '$message' },
          latestId: { $first: '$_id' },
        },
      },
      { $sort: { lastAt: -1 } },
      { $facet: { rows: [{ $skip: offset }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ]);

    const rows = result?.rows || [];
    const names = await userNames(rows.map((r) => r.assignedTo));
    const people = rows.map((r) => {
      const titles = [...new Set((r.titles || []).map((t) => stripHtml(t)).filter(Boolean))];
      return {
        key: r._id,
        name: r.name,
        email: (r.emails || []).find(Boolean) || '',
        phone: (r.phones || []).find(Boolean) || '',
        count: r.count,
        lastAt: r.lastAt,
        firstAt: r.firstAt,
        sources: (r.sources || []).filter(Boolean),
        titles: titles.slice(0, 3),
        moreTitles: Math.max(0, titles.length - 3),
        stages: [...new Set((r.statuses || []).map((s) => STAGE_OF_STATUS[s]).filter(Boolean))],
        assignedTo: r.assignedTo ? { _id: r.assignedTo, name: names[String(r.assignedTo)] || '' } : null,
        lastContactAt: r.lastContactAt || null,
        lastMessage: stripHtml(r.lastMessage || '').slice(0, 160),
        latestId: r.latestId,
      };
    });

    // Cantidad de personas por etapa (para los contadores de las pestañas)
    const countsRaw = await Lead.aggregate([
      { $match: baseMatch(req, { withStage: false }) },
      { $group: { _id: { k: { $ifNull: ['$contactKey', { $toString: '$_id' }] }, s: '$status' } } },
      { $group: { _id: '$_id.s', n: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(Object.keys(STAGES).map((s) => [s, 0]));
    countsRaw.forEach((c) => { const st = STAGE_OF_STATUS[c._id]; if (st) counts[st] += c.n; });

    res.json({ meta: { total: result?.total?.[0]?.n || 0, limit, offset }, counts, objects: people });
  } catch (error) {
    next(error);
  }
}

// GET /leads/person/:key → todas las consultas de la persona y su línea de tiempo
export async function getPerson(req, res, next) {
  try {
    const key = String(req.params.key || '');
    const leads = await Lead.find(mongoose.isValidObjectId(key) ? { $or: [{ contactKey: key }, { _id: key }] } : { contactKey: key })
      .sort({ createdAt: -1 }).populate('assignedTo', 'name').lean();
    if (!leads.length) return res.status(404).json({ message: 'No encontramos a esa persona' });

    const ids = leads.map((l) => String(l._id));
    const activities = await Activity.find({ entityType: 'lead', entityId: { $in: ids }, type: { $in: ['lead_status_changed', 'lead_assigned'] } })
      .sort({ createdAt: -1 }).limit(100).lean();

    const timeline = [];
    leads.forEach((l) => {
      timeline.push({ kind: 'lead', at: l.createdAt, source: l.source, propertyId: l.propertyId, propertyTitle: stripHtml(l.propertyTitle || ''), message: stripHtml(l.message || '') });
      (l.contactLog || []).forEach((c) => timeline.push({ kind: c.channel === 'nota' ? 'note' : 'contact', at: c.at, channel: c.channel, user: c.userName || '', text: c.text || '' }));
    });
    activities.forEach((a) => timeline.push({ kind: a.type === 'lead_assigned' ? 'assigned' : 'status', at: a.createdAt, user: a.userName || '', text: stripHtml(a.description || '') }));
    timeline.sort((a, b) => new Date(b.at) - new Date(a.at));

    const first = leads[0];
    res.json({
      key: first.contactKey || String(first._id),
      name: first.name,
      email: leads.map((l) => l.email).find(Boolean) || '',
      phone: leads.map((l) => l.phone).find(Boolean) || '',
      assignedTo: leads.find((l) => l.assignedTo)?.assignedTo || null,
      emailOptOut: leads.some((l) => l.emailOptOut),
      stage: STAGE_OF_STATUS[first.status] || 'nuevas',
      leads,
      timeline,
    });
  } catch (error) {
    next(error);
  }
}

// POST /leads/person/:key/contact { channel } — tocar WhatsApp / Llamar / Email deja registro,
// pasa las consultas nuevas a «En conversación» y, si nadie la tenía, se la asigna a quien contactó.
export async function contactPerson(req, res, next) {
  try {
    const key = String(req.params.key || '');
    const channel = ['whatsapp', 'llamada', 'email', 'portal'].includes(req.body?.channel) ? req.body.channel : 'whatsapp';
    const leads = await Lead.find({ contactKey: key }, { _id: 1, status: 1, assignedTo: 1, name: 1 }).sort({ createdAt: -1 }).lean();
    if (!leads.length) return res.status(404).json({ message: 'No encontramos a esa persona' });

    const now = new Date();
    const userId = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined;
    const ids = leads.map((l) => l._id);
    const opened = leads.filter((l) => l.status === 'nuevo').map((l) => l._id);
    const unassigned = leads.filter((l) => !l.assignedTo).map((l) => l._id);

    await Lead.updateOne({ _id: ids[0] }, { $push: { contactLog: { channel, userId, userName: req.user?.name, at: now } } });
    await Lead.updateMany({ _id: { $in: ids } }, { $set: { lastContactAt: now } });
    if (opened.length) await Lead.updateMany({ _id: { $in: opened } }, { $set: { status: 'en_progreso' } });
    if (unassigned.length && userId) await Lead.updateMany({ _id: { $in: unassigned } }, { $set: { assignedTo: userId } });

    await Activity.create({
      type: 'lead_status_changed',
      description: `${req.user?.name || 'Alguien'} contactó a ${leads[0].name} por ${CHANNEL_LABEL[channel]}`,
      userId: req.user?.id, userName: req.user?.name, entityId: String(ids[0]), entityType: 'lead',
      meta: { channel, newStatus: opened.length ? 'en_progreso' : undefined, contactKey: key },
    });

    res.json({ ok: true, opened: opened.length, assigned: unassigned.length && userId ? unassigned.length : 0 });
  } catch (error) {
    next(error);
  }
}

// POST /leads/person/:key/note { text }
export async function addPersonNote(req, res, next) {
  try {
    const key = String(req.params.key || '');
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: 'La nota está vacía' });
    const latest = await Lead.findOne({ contactKey: key }, { _id: 1 }).sort({ createdAt: -1 }).lean();
    if (!latest) return res.status(404).json({ message: 'No encontramos a esa persona' });
    await Lead.updateOne({ _id: latest._id }, {
      $push: { contactLog: { channel: 'nota', userId: req.user?.id, userName: req.user?.name, text, at: new Date() } },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

// PATCH /leads/person/:key { status?, assignedTo? } — se aplica a todas las consultas de la persona
export async function updatePerson(req, res, next) {
  try {
    const key = String(req.params.key || '');
    const { status, assignedTo } = req.body || {};
    const set = {};
    const allowed = ['nuevo', 'en_progreso', 'contactado', 'reservado', 'cerrado', 'descartado', 'historico'];
    if (status !== undefined) {
      if (!allowed.includes(status)) return res.status(400).json({ message: 'Estado inválido' });
      set.status = status;
    }
    if (assignedTo !== undefined) {
      if (assignedTo && !mongoose.isValidObjectId(assignedTo)) return res.status(400).json({ message: 'Asesor inválido' });
      set.assignedTo = assignedTo || null;
    }
    if (!Object.keys(set).length) return res.status(400).json({ message: 'Nada para cambiar' });

    const leads = await Lead.find({ contactKey: key }, { _id: 1, name: 1 }).sort({ createdAt: -1 }).lean();
    if (!leads.length) return res.status(404).json({ message: 'No encontramos a esa persona' });
    await Lead.updateMany({ contactKey: key }, { $set: set });

    let assigneeName = '';
    if (set.assignedTo) assigneeName = (await User.findById(set.assignedTo, { name: 1 }).lean())?.name || '';
    await Activity.create({
      type: set.assignedTo !== undefined && set.assignedTo ? 'lead_assigned' : 'lead_status_changed',
      description: set.status
        ? `${req.user?.name} pasó a ${leads[0].name} a «${set.status.replace('_', ' ')}»`
        : set.assignedTo
          ? `${req.user?.name} asignó a ${leads[0].name} a ${assigneeName}`
          : `${req.user?.name} dejó a ${leads[0].name} sin asignar`,
      userId: req.user?.id, userName: req.user?.name, entityId: String(leads[0]._id), entityType: 'lead',
      meta: { contactKey: key, ...set },
    });
    res.json({ ok: true, updated: leads.length });
  } catch (error) {
    next(error);
  }
}

// GET/POST /leads/archive-old?days=30 — consultas «nuevas» viejas y sin ningún contacto pasan a
// «Históricas» de una vez (no se borran). GET devuelve cuántas serían.
function archiveFilter(days) {
  const cutoff = new Date(Date.now() - Math.max(7, Number(days) || 30) * 24 * 60 * 60 * 1000);
  return { status: 'nuevo', createdAt: { $lt: cutoff }, $or: [{ lastContactAt: { $exists: false } }, { lastContactAt: null }] };
}

export async function previewArchiveOld(req, res, next) {
  try {
    res.json({ count: await Lead.countDocuments(archiveFilter(req.query.days)) });
  } catch (error) {
    next(error);
  }
}

export async function archiveOld(req, res, next) {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Solo un administrador puede pasar consultas a históricas' });
    const days = req.body?.days || req.query.days || 30;
    const result = await Lead.updateMany(archiveFilter(days), { $set: { status: 'historico' } });
    await Activity.create({
      type: 'lead_status_changed',
      description: `${req.user?.name} pasó ${result.modifiedCount} consultas viejas a «Históricas»`,
      userId: req.user?.id, userName: req.user?.name, entityType: 'system',
      meta: { archived: result.modifiedCount, days: Number(days) },
    });
    res.json({ archived: result.modifiedCount });
  } catch (error) {
    next(error);
  }
}
