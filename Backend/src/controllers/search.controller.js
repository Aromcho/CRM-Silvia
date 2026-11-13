import Property from '../models/Property.model.js';
import Lead from '../models/Lead.model.js';

// Buscador único del CRM (C13, Ctrl K): propiedades (también temporarios), personas que
// consultaron y reservas de temporada, en una sola llamada.

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripHtml = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function coverOf(p) {
  const photos = (p.photos || []).filter((x) => !x.is_blueprint);
  const c = photos.find((x) => x.is_front_cover) || photos[0];
  return c ? (c.local_thumb || c.local_image || c.thumb_url || c.image_url || '') : '';
}

// GET /search?q=
export async function globalSearch(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q.length < 2) return res.json({ properties: [], people: [], bookings: [] });
    const rx = new RegExp(esc(q), 'i');
    const digits = q.replace(/\D/g, '');
    const isId = /^#?\d{4,}$/.test(q);

    const propOr = [{ publication_title: rx }, { address: rx }, { 'location.name': rx }, { reference_code: rx }];
    if (isId) propOr.unshift({ id: Number(digits) });

    const leadOr = [{ name: rx }, { email: rx }];
    if (digits.length >= 6) leadOr.push({ phone: new RegExp(esc(digits.slice(-8))) });

    const [props, people, bookingProps] = await Promise.all([
      Property.find({ $or: propOr }, {
        id: 1, publication_title: 1, address: 1, 'location.name': 1, status: 1, photos: 1, 'operations.operation_type': 1, reference_code: 1,
      }).sort({ updatedAt: -1 }).limit(7).lean(),
      Lead.aggregate([
        { $match: { $or: leadOr } },
        { $sort: { createdAt: -1 } },
        { $group: {
          _id: { $ifNull: ['$contactKey', { $toString: '$_id' }] },
          name: { $first: '$name' }, phone: { $first: '$phone' }, email: { $first: '$email' },
          last: { $first: '$createdAt' }, count: { $sum: 1 }, propertyTitle: { $first: '$propertyTitle' }, status: { $first: '$status' },
        } },
        { $sort: { last: -1 } },
        { $limit: 6 },
      ]),
      Property.aggregate([
        { $match: { 'temporaryRental.bookings.guestName': rx } },
        { $project: { id: 1, address: 1, publication_title: 1, bookings: '$temporaryRental.bookings' } },
        { $unwind: '$bookings' },
        { $match: { 'bookings.guestName': rx } },
        { $sort: { 'bookings.startDate': -1 } },
        { $limit: 6 },
      ]),
    ]);

    res.json({
      properties: props.map((p) => ({
        id: p.id, title: stripHtml(p.publication_title) || p.address || `Propiedad ${p.id}`, address: p.address || '',
        place: p.location?.name || '', status: p.status, photo: coverOf(p),
        ops: [...new Set((p.operations || []).map((o) => o.operation_type).filter(Boolean))].join(' · '),
      })),
      people: people.map((x) => ({
        key: x._id, name: x.name || x.email || x.phone || 'Sin nombre', phone: x.phone || '', email: x.email || '',
        last: x.last, count: x.count, propertyTitle: stripHtml(x.propertyTitle || ''), status: x.status,
      })),
      bookings: bookingProps.map((b) => ({
        propertyId: b.id, address: b.address || stripHtml(b.publication_title) || `Propiedad ${b.id}`,
        guestName: b.bookings.guestName, startDate: b.bookings.startDate, endDate: b.bookings.endDate, status: b.bookings.status,
      })),
    });
  } catch (error) {
    next(error);
  }
}
