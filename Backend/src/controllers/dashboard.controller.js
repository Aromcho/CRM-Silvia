import Lead from '../models/Lead.model.js';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';
import { contactKey, initials, stripHtml, clip } from '../utils/contactKey.js';

// «Hoy» (C1): lo que hay que resolver hoy, la temporada de un vistazo y la actividad del equipo
// agrupada y legible. Todo se calcula acá para que el inicio cargue con una sola llamada.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const UNANSWERED_WINDOW_HOURS = 48;

const STATUS_LABELS = {
  disponible: 'Disponible', reservada: 'Reservada', vendida: 'Vendida', alquilado: 'Alquilada',
  en_tasacion: 'En tasación', no_disponible: 'No disponible',
};

const PLATFORM_LABELS = { mercadolibre: 'MercadoLibre', zonaprop: 'ZonaProp' };

function propertyLabel(p) {
  return stripHtml(p?.address || p?.publication_title || '') || `Propiedad #${p?.id}`;
}

function firstPhoto(p) {
  const photos = Array.isArray(p?.photos) ? p.photos : [];
  const cover = photos.find((ph) => ph?.is_front_cover) || photos[0];
  return cover ? (cover.local_thumb || cover.local_image || cover.thumb_url || cover.image_url || '') : '';
}

// ─── Consultas sin responder, agrupadas por persona ────────────────────────────────────────
async function buildUnanswered(now) {
  const since = new Date(now - UNANSWERED_WINDOW_HOURS * HOUR);
  const [recent, olderCount] = await Promise.all([
    Lead.find({ status: 'nuevo', createdAt: { $gte: since } }, { name: 1, email: 1, phone: 1, propertyTitle: 1, source: 1, createdAt: 1 })
      .sort({ createdAt: -1 }).limit(500).lean(),
    Lead.countDocuments({ status: 'nuevo', createdAt: { $lt: since } }),
  ]);

  const people = new Map();
  for (const lead of recent) {
    const key = contactKey(lead);
    const person = people.get(key);
    if (person) person.count += 1;
    else people.set(key, { name: lead.name, initials: initials(lead.name), count: 1, propertyTitle: lead.propertyTitle || '', source: lead.source, createdAt: lead.createdAt });
  }
  const list = [...people.values()];
  return {
    windowHours: UNANSWERED_WINDOW_HOURS,
    leads: recent.length,
    people: list.length,
    latest: list[0] || null,
    sample: list.slice(0, 4).map((p) => ({ name: p.name, initials: p.initials })),
    olderNew: olderCount,
  };
}

// ─── Difusión: avisos con error, destacados en uso ─────────────────────────────────────────
function difusionIssues(p) {
  const issues = [];
  const ml = p.difusion?.mercadolibre;
  if (ml) {
    const listings = Array.isArray(ml.listings) ? ml.listings : [];
    listings.forEach((l) => {
      const message = stripHtml(l.last_error || (l.status === 'under_review' ? (l.sub_status || 'En revisión de MercadoLibre') : ''));
      if (message) issues.push({ platform: 'mercadolibre', operation: l.operation_type || '', message: clip(message, 140) });
    });
    if (!listings.length && ml.last_error) issues.push({ platform: 'mercadolibre', operation: '', message: clip(stripHtml(ml.last_error), 140) });
  }
  const zp = p.difusion?.zonaprop;
  if (zp) {
    const zpError = zp.errors?.[0]?.message || zp.last_error || (zp.estado === 'ERROR' ? 'ZonaProp rechazó el aviso' : '');
    if (zpError) issues.push({ platform: 'zonaprop', operation: '', message: clip(stripHtml(zpError), 140) });
  }
  return issues;
}

function isHighlighted(p) {
  const ml = (p.difusion?.mercadolibre?.listings || []).filter((l) => l.listing_type_id === 'gold_premium' && l.status === 'active').length;
  const zpPlan = String(p.difusion?.zonaprop?.tipoDePublicacion || '');
  const zp = p.difusion?.zonaprop?.published && /DESTACADO|HOME/i.test(zpPlan) ? 1 : 0;
  return { ml, zp };
}

// ─── Temporada (dic–mar) ───────────────────────────────────────────────────────────────────
function currentSeason(now) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0 = enero
  const startYear = m <= 2 ? y - 1 : y; // ene–mar: temporada que empezó el año anterior
  return { startYear, label: `${startYear}/${String(startYear + 1).slice(-2)}`, from: new Date(startYear, 11, 1), to: new Date(startYear + 1, 3, 1) };
}

function buildSeason(properties, now) {
  const season = currentSeason(now);
  const months = { 11: 0, 0: 0, 1: 0, 2: 0 };
  let total = 0;
  let nextIn = null;
  let nextOut = null;
  let weekIn = 0;
  let weekOut = 0;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today.getTime() + 7 * DAY);

  for (const p of properties) {
    const bookings = p.temporaryRental?.bookings || [];
    for (const b of bookings) {
      if (!b?.startDate || b.status === 'bloqueado') continue;
      const start = new Date(b.startDate);
      const end = b.endDate ? new Date(b.endDate) : null;
      if (start >= season.from && start < season.to) {
        total += 1;
        if (months[start.getMonth()] !== undefined) months[start.getMonth()] += 1;
      }
      const ref = { propertyId: p.id, address: propertyLabel(p), guestName: b.guestName || '', date: start };
      if (start >= today && (!nextIn || start < nextIn.date)) nextIn = ref;
      if (start >= today && start < weekEnd) weekIn += 1;
      if (end && end >= today) {
        if (!nextOut || end < nextOut.date) nextOut = { ...ref, date: end };
        if (end < weekEnd) weekOut += 1;
      }
    }
  }
  return {
    label: season.label,
    total,
    byMonth: [
      { key: 'dic', label: 'Dic', count: months[11] },
      { key: 'ene', label: 'Ene', count: months[0] },
      { key: 'feb', label: 'Feb', count: months[1] },
      { key: 'mar', label: 'Mar', count: months[2] },
    ],
    nextIn,
    nextOut,
    weekIn,
    weekOut,
  };
}

// ─── Actividad del equipo, agrupada ────────────────────────────────────────────────────────
const FEED_TYPES = ['property_created', 'property_updated', 'property_status_changed', 'property_duplicated', 'lead_assigned', 'lead_status_changed'];
const GROUP_WINDOW = 3 * HOUR;
const GEO_PATH = /^geo_(lat|long)$|^gm_location_type$/;

const fmtNumber = (v) => {
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n.toLocaleString('es-AR') : String(v);
};

function joinWithY(parts) {
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

function describePropertyGroup(items) {
  // items: del más nuevo al más viejo
  const changes = new Map();
  let photos = 0;
  let created = false;
  let duplicated = false;
  let status = null;
  const platforms = new Set();

  for (const act of items) {
    if (act.type === 'property_created') created = true;
    if (act.type === 'property_duplicated') duplicated = true;
    if (act.meta?.photosAdded) photos += Number(act.meta.photosAdded) || 0;
    if (act.meta?.newStatus && !status) status = act.meta.newStatus;
    if (act.meta?.platform) platforms.add(PLATFORM_LABELS[act.meta.platform] || act.meta.platform);
    for (const c of Array.isArray(act.meta?.changes) ? act.meta.changes : []) {
      const key = c.path || c.label;
      const prev = changes.get(key);
      // Se recorre del más nuevo al más viejo: el primero trae el valor final, el último el inicial
      if (prev) prev.from = c.from;
      else changes.set(key, { ...c });
    }
  }

  const list = [...changes.values()];
  const price = list.find((c) => c.label === 'Precio');
  const description = list.find((c) => c.path === 'description' || c.label === 'Descripción');
  const title = list.find((c) => c.path === 'publication_title');
  const statusChange = list.find((c) => c.path === 'status');
  const geo = list.filter((c) => GEO_PATH.test(c.path || ''));
  const rest = list.filter((c) => c !== price && c !== description && c !== title && c !== statusChange && !GEO_PATH.test(c.path || '') && c.label !== 'Moneda');

  const parts = [];
  const kinds = new Set();
  if (created) { parts.push('cargó la propiedad'); kinds.add('created'); }
  if (duplicated) { parts.push('duplicó la ficha'); kinds.add('created'); }
  if (price) {
    const from = Number(String(price.from).replace(/[^\d.-]/g, ''));
    const to = Number(String(price.to).replace(/[^\d.-]/g, ''));
    const verb = Number.isFinite(from) && Number.isFinite(to) && to < from ? 'bajó' : 'subió';
    parts.push(price.from === '(vacío)' ? `cargó el precio: ${fmtNumber(price.to)}` : `${verb} el precio de ${fmtNumber(price.from)} a ${fmtNumber(price.to)}`);
    kinds.add('price');
  }
  const finalStatus = status || (statusChange ? statusChange.to : null);
  if (finalStatus) { parts.push(`la pasó a «${STATUS_LABELS[finalStatus] || finalStatus}»`); kinds.add('status'); }
  if (photos) { parts.push(`subió ${photos === 1 ? '1 foto' : `${photos} fotos`}`); kinds.add('photos'); }
  if (title) { parts.push('cambió el título'); kinds.add('edit'); }
  if (description) { parts.push('corrigió la descripción'); kinds.add('edit'); }
  if (rest.length) {
    const labels = rest.map((c) => String(c.label || c.path || 'un dato').toLowerCase());
    const shown = labels.slice(0, 3);
    parts.push(`editó ${joinWithY(labels.length > 3 ? [...shown, `${labels.length - 3} datos más`] : shown)}`);
    kinds.add('edit');
  }
  if (geo.length && !parts.length) { parts.push('ajustó la ubicación en el mapa'); kinds.add('edit'); }
  if (platforms.size) { parts.push(`actualizó la difusión en ${joinWithY([...platforms])}`); kinds.add('edit'); }
  if (!parts.length) { parts.push('editó la ficha'); kinds.add('edit'); }

  const details = [];
  if (title && title.from !== '(vacío)') details.push(`«${clip(stripHtml(title.from), 60)}» → «${clip(stripHtml(title.to), 60)}»`);
  rest.slice(0, 3).forEach((c) => {
    details.push(`${c.label}: «${clip(stripHtml(c.from), 40)}» → «${clip(stripHtml(c.to), 40)}»`);
  });

  return { text: joinWithY(parts), details: details.slice(0, 3), kinds: [...kinds] };
}

async function buildActivity() {
  const raw = await Activity.find({ type: { $in: FEED_TYPES } }).sort({ createdAt: -1 }).limit(300).lean();

  const groups = [];
  for (const act of raw) {
    const last = groups[groups.length - 1];
    const sameGroup = last
      && act.entityType === 'property'
      && last.entityType === 'property'
      && last.entityId === act.entityId
      && (last.userName || '') === (act.userName || '')
      && new Date(last.items[0].createdAt) - new Date(act.createdAt) <= GROUP_WINDOW;
    if (sameGroup) last.items.push(act);
    else groups.push({ entityType: act.entityType, entityId: act.entityId, userName: act.userName || '', items: [act] });
  }

  return groups.slice(0, 40).map((g) => {
    const newest = g.items[0];
    const base = {
      id: String(newest._id),
      user: g.userName || 'Sistema',
      userInitials: initials(g.userName || 'S'),
      at: newest.createdAt,
      count: g.items.length,
    };
    if (g.entityType === 'property') {
      const meta = g.items.find((a) => a.meta?.address || a.meta?.image)?.meta || {};
      return {
        ...base,
        entityType: 'property',
        propertyId: g.entityId,
        address: stripHtml(meta.address || '') || `Propiedad #${g.entityId}`,
        image: meta.image || '',
        ...describePropertyGroup(g.items),
      };
    }
    const desc = stripHtml(newest.description);
    const prefix = g.userName ? `${g.userName} ` : '';
    return {
      ...base,
      entityType: g.entityType,
      leadId: g.entityId,
      text: desc.startsWith(prefix) ? desc.slice(prefix.length) : desc,
      details: [],
      kinds: [newest.type === 'lead_status_changed' ? 'status' : 'lead'],
    };
  });
}

export async function getToday(req, res, next) {
  try {
    const now = Date.now();
    const [unanswered, properties, activity] = await Promise.all([
      buildUnanswered(now),
      Property.find({}, {
        id: 1, address: 1, publication_title: 1, status: 1, photos: { $slice: 6 }, difusion: 1,
        'temporaryRental.bookings': 1,
      }).lean(),
      buildActivity(),
    ]);

    const portfolio = { total: properties.length, disponible: 0, reservada: 0, vendida: 0, otras: 0 };
    const difusionErrors = [];
    const highlights = { mercadolibre: 0, zonaprop: 0 };

    for (const p of properties) {
      if (p.status === 'disponible' || p.status === 'reservada' || p.status === 'vendida') portfolio[p.status] += 1;
      else portfolio.otras += 1;

      const h = isHighlighted(p);
      highlights.mercadolibre += h.ml;
      highlights.zonaprop += h.zp;

      if (p.status === 'disponible' || p.status === 'reservada') {
        difusionIssues(p).forEach((issue) => difusionErrors.push({
          ...issue, propertyId: p.id, address: propertyLabel(p), image: firstPhoto(p),
        }));
      }
    }

    const errorsByPlatform = difusionErrors.reduce((acc, e) => ({ ...acc, [e.platform]: (acc[e.platform] || 0) + 1 }), {});

    res.json({
      generatedAt: new Date(now),
      unanswered,
      difusion: {
        errors: difusionErrors.length,
        byPlatform: { mercadolibre: errorsByPlatform.mercadolibre || 0, zonaprop: errorsByPlatform.zonaprop || 0 },
        items: difusionErrors.slice(0, 8),
      },
      highlights,
      season: buildSeason(properties, now),
      portfolio,
      activity,
    });
  } catch (error) {
    next(error);
  }
}
