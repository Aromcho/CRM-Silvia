import mongoose from 'mongoose';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';
import { nextSequence } from '../models/Sequence.model.js';

// Reservas de temporada (C6), una por una. Antes el CRM reescribía la lista entera de reservas de la
// propiedad en cada guardado: si dos personas cargaban a la vez, se perdía una. Ahora cada alta,
// cambio o baja es una operación atómica sobre esa reserva, el control de superposición lo hace la
// propia consulta a Mongo (no puede colarse otra reserva entre el control y el guardado) y cada
// cambio queda en el historial de la reserva con su autor.

const FIELDS = ['startDate', 'endDate', 'guestName', 'guestPhone', 'guestDni', 'guests', 'currency', 'total', 'deposit', 'notes', 'status'];
const LABELS = {
  startDate: 'entrada', endDate: 'salida', guestName: 'huésped', guestPhone: 'teléfono', guestDni: 'DNI',
  guests: 'personas', currency: 'moneda', total: 'total', deposit: 'seña', notes: 'notas', status: 'estado',
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toDay(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  if (!ISO.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function money(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// Solo los campos conocidos, ya normalizados. `partial` = edición (lo que no viene no se toca).
function pick(body = {}, partial = false) {
  const out = {};
  for (const k of FIELDS) {
    if (partial && !(k in body)) continue;
    const v = body[k];
    if (k === 'startDate' || k === 'endDate') out[k] = toDay(v);
    else if (k === 'total' || k === 'deposit') out[k] = money(v);
    else if (k === 'guests') { const n = parseInt(v, 10); out[k] = Number.isFinite(n) && n > 0 && n < 100 ? n : null; }
    else if (k === 'status') out[k] = v === 'bloqueado' ? 'bloqueado' : 'reservado';
    else if (k === 'currency') out[k] = ['USD', 'ARS'].includes(v) ? v : null;
    else out[k] = v == null ? '' : String(v).trim().slice(0, 500);
  }
  return out;
}

function fmt(d) {
  if (!d) return '—';
  const x = new Date(d);
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
}

function same(a, b) {
  if (a instanceof Date || b instanceof Date) return (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
  return (a ?? '') === (b ?? '');
}

function overlapFilter(start, end, exceptId) {
  const m = { startDate: { $lt: end }, endDate: { $gt: start } };
  if (exceptId) m._id = { $ne: exceptId };
  return { $not: { $elemMatch: m } };
}

async function clashMessage(propertyId, start, end, exceptId) {
  const p = await Property.findOne({ id: propertyId }, { 'temporaryRental.bookings': 1 }).lean();
  if (!p) return null;
  const c = (p.temporaryRental?.bookings || []).find((b) => String(b._id) !== String(exceptId || '')
    && new Date(b.startDate) < end && new Date(b.endDate) > start);
  if (!c) return null;
  return `Se superpone con ${c.guestName ? `la reserva de ${c.guestName}` : c.status === 'bloqueado' ? 'un bloqueo' : 'otra reserva'} (${fmt(c.startDate)} → ${fmt(c.endDate)}).`;
}

function log(req, property, description, meta) {
  Activity.create({
    type: 'property_updated', entityType: 'property', entityId: String(property.id),
    userId: req.user?.id, userName: req.user?.name, description, meta,
  }).catch(() => {});
}

function title(p) {
  return p.publication_title || p.address || `#${p.id}`;
}

function respond(res, property, bookingId, status = 200) {
  const bookings = property.temporaryRental?.bookings || [];
  const booking = bookings.find((b) => String(b._id) === String(bookingId)) || null;
  res.status(status).json({ booking, bookings, temporaryRental: property.temporaryRental });
}

// POST /properties/:id/bookings
export async function createBooking(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = pick(req.body);
    if (!data.startDate || !data.endDate) return res.status(400).json({ message: 'Faltan las fechas de entrada y salida.' });
    if (data.endDate < data.startDate) [data.startDate, data.endDate] = [data.endDate, data.startDate];
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();
    const booking = {
      ...data, _id, createdAt: now, updatedAt: now,
      createdById: req.user?.id, createdByName: req.user?.name, updatedByName: req.user?.name,
      history: [{ at: now, userId: req.user?.id, userName: req.user?.name, action: 'creada' }],
    };
    const updated = await Property.findOneAndUpdate(
      { id, 'temporaryRental.bookings': overlapFilter(data.startDate, data.endDate) },
      { $push: { 'temporaryRental.bookings': booking } },
      { new: true },
    ).lean();
    if (!updated) {
      const msg = await clashMessage(id, data.startDate, data.endDate);
      return res.status(msg ? 409 : 404).json({ message: msg || 'Propiedad no encontrada' });
    }
    log(req, updated, `${req.user?.name || 'Alguien'} cargó ${data.status === 'bloqueado' ? 'un bloqueo' : 'una reserva'} en ${title(updated)}: ${fmt(data.startDate)} → ${fmt(data.endDate)}${data.guestName ? ` (${data.guestName})` : ''}`, { bookingId: String(_id) });
    respond(res, updated, _id, 201);
  } catch (error) {
    next(error);
  }
}

// PATCH /properties/:id/bookings/:bookingId — solo los campos enviados
export async function updateBooking(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { bookingId } = req.params;
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: 'Reserva inválida' });
    const bid = new mongoose.Types.ObjectId(bookingId);
    const current = await Property.findOne({ id, 'temporaryRental.bookings._id': bid }, { id: 1, publication_title: 1, address: 1, 'temporaryRental.bookings.$': 1 }).lean();
    const old = current?.temporaryRental?.bookings?.[0];
    if (!old) return res.status(404).json({ message: 'La reserva ya no existe (puede que otra persona la haya borrado).' });

    const data = pick(req.body, true);
    const start = data.startDate !== undefined ? data.startDate : old.startDate;
    const end = data.endDate !== undefined ? data.endDate : old.endDate;
    if (!start || !end) return res.status(400).json({ message: 'Faltan las fechas de entrada y salida.' });
    if (end < start) return res.status(400).json({ message: 'La salida no puede ser antes de la entrada.' });

    const changes = Object.keys(data).filter((k) => !same(data[k], old[k])).map((k) => LABELS[k]);
    if (!changes.length) return respond(res, await Property.findOne({ id }).lean(), bid);

    const set = { 'temporaryRental.bookings.$[b].updatedAt': new Date(), 'temporaryRental.bookings.$[b].updatedByName': req.user?.name };
    Object.entries(data).forEach(([k, v]) => { set[`temporaryRental.bookings.$[b].${k}`] = v; });
    const updated = await Property.findOneAndUpdate(
      { id, 'temporaryRental.bookings._id': bid, 'temporaryRental.bookings': overlapFilter(start, end, bid) },
      {
        $set: set,
        $push: { 'temporaryRental.bookings.$[b].history': { at: new Date(), userId: req.user?.id, userName: req.user?.name, action: 'editada', changes } },
      },
      { new: true, arrayFilters: [{ 'b._id': bid }] },
    ).lean();
    if (!updated) {
      const msg = await clashMessage(id, start, end, bid);
      return res.status(msg ? 409 : 404).json({ message: msg || 'La reserva ya no existe.' });
    }
    log(req, updated, `${req.user?.name || 'Alguien'} editó la reserva ${fmt(start)} → ${fmt(end)} de ${title(updated)} (${changes.join(', ')})`, { bookingId });
    respond(res, updated, bid);
  } catch (error) {
    next(error);
  }
}

// DELETE /properties/:id/bookings/:bookingId
export async function deleteBooking(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { bookingId } = req.params;
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: 'Reserva inválida' });
    const bid = new mongoose.Types.ObjectId(bookingId);
    const before = await Property.findOne({ id, 'temporaryRental.bookings._id': bid }, { 'temporaryRental.bookings.$': 1 }).lean();
    const gone = before?.temporaryRental?.bookings?.[0];
    const after = await Property.findOneAndUpdate(
      { id },
      { $pull: { 'temporaryRental.bookings': { _id: bid } } },
      { new: true },
    ).lean();
    if (!after) return res.status(404).json({ message: 'Propiedad no encontrada' });
    if (gone) {
      log(req, after, `${req.user?.name || 'Alguien'} borró la reserva ${fmt(gone.startDate)} → ${fmt(gone.endDate)}${gone.guestName ? ` de ${gone.guestName}` : ''} en ${title(after)}${gone.receiptNumber ? ` (tenía el recibo N.º ${gone.receiptNumber})` : ''}`, { bookingId, booking: gone });
    }
    respond(res, after, null);
  } catch (error) {
    next(error);
  }
}

// POST /properties/:id/bookings/:bookingId/receipt — asigna el número de recibo (una sola vez)
export async function issueBookingReceipt(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { bookingId } = req.params;
    if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: 'Reserva inválida' });
    const bid = new mongoose.Types.ObjectId(bookingId);
    const current = await Property.findOne({ id, 'temporaryRental.bookings._id': bid }, { 'temporaryRental.bookings.$': 1 }).lean();
    const old = current?.temporaryRental?.bookings?.[0];
    if (!old) return res.status(404).json({ message: 'La reserva ya no existe.' });
    if (old.receiptNumber) return respond(res, await Property.findOne({ id }).lean(), bid);

    const number = await nextSequence('recibo-reserva');
    const updated = await Property.findOneAndUpdate(
      { id, 'temporaryRental.bookings': { $elemMatch: { _id: bid, receiptNumber: { $exists: false } } } },
      {
        $set: { 'temporaryRental.bookings.$[b].receiptNumber': number, 'temporaryRental.bookings.$[b].receiptIssuedAt': new Date() },
        $push: { 'temporaryRental.bookings.$[b].history': { at: new Date(), userId: req.user?.id, userName: req.user?.name, action: 'recibo', changes: [`N.º ${number}`] } },
      },
      { new: true, arrayFilters: [{ 'b._id': bid }] },
    ).lean();
    // Si otra persona lo emitió en el mismo instante, vale el número que quedó guardado
    const doc = updated || await Property.findOne({ id }).lean();
    if (updated) log(req, updated, `${req.user?.name || 'Alguien'} emitió el recibo de reserva N.º ${number} (${title(updated)}, ${fmt(old.startDate)} → ${fmt(old.endDate)})`, { bookingId, receiptNumber: number });
    respond(res, doc, bid);
  } catch (error) {
    next(error);
  }
}
