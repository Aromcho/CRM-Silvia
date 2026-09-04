import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sanitizeHtml from 'sanitize-html';
import Property from '../models/Property.model.js';
import PropertyManager from '../manager/property.manager.js';
import Activity from '../models/Activity.model.js';
import { syncWithTokko } from '../utils/syncWithTokko.js';
import { importRentalExcelFile, RENTAL_XLSX_PATH } from '../utils/rentalExcelImporter.js';
import { nextManualPropertyId } from '../models/Counter.model.js';
import * as ml from '../utils/mercadolibre.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'properties');

// Re-sincroniza con MercadoLibre en cada edición desde el CRM, para no depender de que alguien
// se acuerde de tocar "Sincronizar ahora". Solo para propiedades YA publicadas (tienen item_id) —
// si nunca se publicó a mano, una edición cualquiera no debe crear una publicación nueva sola.
async function triggerMlSync(property) {
  const listings = property.difusion?.mercadolibre?.listings || [];
  if (!listings.some((l) => l.item_id)) return;
  if (!(await ml.isConnected())) return;
  await ml.syncProperty(property);
}

const normalizeText = (v = '') => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const escapeRegex = (v = '') => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// La descripción se edita como texto enriquecido en el CRM y se inyecta como HTML crudo en la
// web pública (dangerouslySetInnerHTML), así que se sanitiza acá antes de guardar — solo se
// permiten las etiquetas que puede producir el editor (Tiptap StarterKit), sin atributos ni estilos.
const sanitizeDescription = (html) => sanitizeHtml(html, {
  allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
  allowedAttributes: {},
});

// Etiquetas en español para el diff de "Actividad reciente" — mismos labels que usa PropertyDetail.js
// en sus <Row label="...">, para que el feed diga lo mismo que el usuario ve al editar.
const ACTIVITY_FIELD_LABELS = {
  address: 'Dirección', publication_title: 'Título de publicación', description: 'Descripción',
  'location.name': 'Barrio / zona', 'location.full_location': 'Ubicación',
  credit_eligible: 'Crédito', expenses: 'Expensas',
  room_amount: 'Ambientes', age: 'Antigüedad', bathroom_amount: 'Baños', property_condition: 'Condición',
  suite_amount: 'Dormitorios', orientation: 'Orientación', floors_amount: 'Plantas', situation: 'Situación',
  total_suites: 'Suites', suites_with_closets: 'Suites con placares', toilet_amount: 'Toilettes',
  zonification: 'Zonificación', distanciaMar: 'Distancia al mar', aptoMascotas: 'Admite mascotas',
  aptoCredito: 'Apto crédito', aptoFinanciacion: 'Apto financiación',
  parking_lot_amount: 'Cocheras', covered_parking_lot: 'Cocheras cubiertas', uncovered_parking_lot: 'Cocheras descubiertas',
  common_area: 'Salas comunes', living_amount: 'Livings', tv_rooms: 'Salas de TV', dining_room: 'Comedores',
  surface: 'Terreno', unroofed_surface: 'Superficie descubierta', roofed_surface: 'Superficie cubierta',
  semiroofed_surface: 'Superficie semicubierta', total_surface: 'Total construido',
  depth_measure: 'Fondo', front_measure: 'Frente', land_access: 'Acceso al terreno',
  'producer.name': 'Nombre del productor', 'producer.phone': 'Teléfono del productor', 'producer.email': 'Email del productor',
  'internal_data.commission': 'Comisión', 'internal_data.producer_comision': 'Comisión productor',
  'internal_data.key_location': 'Ubicación de llave', 'internal_data.legally_checked_text': 'Estado legal',
  'internal_data.internal_comments': 'Comentarios internos', 'internal_data.transaction_requirements': 'Requisitos de la transacción',
  notes: 'Notas del equipo', manual_tags: 'Etiquetas', reference_code: 'Código de referencia', 'type.name': 'Tipo de propiedad',
  real_address: 'Dirección real', status: 'Estado',
};

function activityFieldLabel(path) {
  if (ACTIVITY_FIELD_LABELS[path]) return ACTIVITY_FIELD_LABELS[path];
  if (/^operations\.\d+\.prices\.0\.price$/.test(path)) return 'Precio';
  if (/^operations\.\d+\.prices\.0\.currency$/.test(path)) return 'Moneda';
  if (/^operations\.\d+\.operation_type$/.test(path)) return 'Tipo de operación';
  return path;
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function formatValueForActivity(v) {
  if (v === undefined || v === null || v === '') return '(vacío)';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(vacío)';
  return String(v);
}

// Compara `updates` (paths tipo "location.name" o "operations.0.prices.0.price") contra el doc viejo
// para poder mostrar "cambió X de A a B" en el feed en vez de solo "editó la propiedad".
function buildPropertyChanges(oldDoc, updates) {
  const changes = [];
  for (const path of Object.keys(updates)) {
    if (path === 'lastEditedBy' || path === 'lastEditedAt') continue;
    const from = getByPath(oldDoc, path);
    const to = updates[path];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    changes.push({ path, label: activityFieldLabel(path), from: formatValueForActivity(from), to: formatValueForActivity(to) });
  }
  return changes;
}

export function propertyActivitySnapshot(property) {
  const photo = property.photos?.[0];
  const image = photo ? (photo.local_image || photo.image_url || photo.thumb_url || '') : '';
  return { address: property.address || '', image };
}

const splitValues = (value) => {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((i) => String(i).split(',')).map((i) => i.trim()).filter(Boolean);
};

const OPERATION_ALIASES = {
  venta: ['Venta', 'Sale'], comprar: ['Venta', 'Sale'],
  alquiler: ['Alquiler', 'Rent'],
  'alquiler temporal': ['Alquiler temporal', 'Alquiler Temporario', 'Temporary Rent'],
};
const PROPERTY_TYPE_ALIASES = {
  casa: ['Casa', 'Casas', 'House'],
  departamento: ['Departamento', 'Departamentos', 'Apartment', 'Flat'],
  ph: ['PH'],
  terreno: ['Terreno', 'Terrenos', 'Lote', 'Lotes', 'Campo'],
  lote: ['Terreno', 'Terrenos', 'Lote', 'Lotes', 'Campo'],
  local: ['Local', 'Locales', 'Local Comercial'],
  oficina: ['Oficina', 'Oficinas'],
  hotel: ['Complejo', 'Hotel', 'Hoteles', 'Apart Hotel', 'Emprendimiento'],
  complejo: ['Complejo', 'Hotel', 'Hoteles', 'Apart Hotel', 'Emprendimiento'],
};

function buildRegexList(values, aliases) {
  const patterns = new Set();
  values.map(normalizeText).forEach((value) => {
    if (!value) return;
    const match = Object.entries(aliases).find(([k, vals]) => normalizeText(k) === value || vals.some((v) => normalizeText(v) === value));
    (match ? match[1] : [value]).forEach((v) => v && patterns.add(new RegExp(escapeRegex(v), 'i')));
  });
  return Array.from(patterns);
}

export async function getProperties(req, res, next) {
  try {
    const {
      operation_type, excludeOperationType, property_type, minRooms, maxRooms, minPrice, maxPrice,
      barrio, searchQuery, minGarages, maxGarages, status, capacityGroup,
      limit = 20, offset = 0, order = 'DESC', is_starred,
    } = req.query;

    const and = [];

    const ops = splitValues(operation_type);
    if (ops.length) {
      const rx = buildRegexList(ops, OPERATION_ALIASES);
      if (rx.length) and.push({ 'operations.operation_type': { $in: rx } });
    }

    const excludeOps = splitValues(excludeOperationType);
    if (excludeOps.length) {
      const rx = buildRegexList(excludeOps, OPERATION_ALIASES);
      if (rx.length) and.push({ 'operations.operation_type': { $not: { $in: rx } } });
    }

    const types = splitValues(property_type).filter((v) => v !== '-1' && normalizeText(v) !== 'all');
    if (types.length) {
      const rx = buildRegexList(types, PROPERTY_TYPE_ALIASES);
      if (rx.length) and.push({ 'type.name': { $in: rx } });
    }

    if (minRooms || maxRooms) {
      const f = {};
      if (minRooms) f.$gte = parseInt(minRooms, 10);
      if (maxRooms) f.$lte = parseInt(maxRooms, 10);
      and.push({ suite_amount: f });
    }

    if (minPrice || maxPrice) {
      const f = {};
      if (minPrice) f.$gte = parseInt(minPrice, 10);
      if (maxPrice) f.$lte = parseInt(maxPrice, 10);
      and.push({ 'operations.prices.price': f });
    }

    if (barrio) and.push({ 'location.name': { $regex: barrio, $options: 'i' } });

    if (status && status !== 'all') {
      const statuses = splitValues(status);
      if (statuses.length) and.push({ status: { $in: statuses } });
    }

    if (searchQuery) {
      const q = searchQuery.trim();
      const fields = ['address', 'location.full_location', 'location.name', 'publication_title', 'real_address', 'description', 'producer.name', 'type.name', 'reference_code'];
      const searchOr = [{ $or: fields.map((f) => ({ [f]: { $regex: q, $options: 'i' } })) }];
      const num = parseInt(q, 10);
      if (!isNaN(num)) searchOr.push({ id: num });
      and.push({ $or: searchOr });
    }

    if (minGarages || maxGarages) {
      const f = {};
      if (minGarages) f.$gte = parseInt(minGarages, 10);
      if (maxGarages) f.$lte = parseInt(maxGarages, 10);
      and.push({ parking_lot_amount: f });
    }

    if (is_starred === 'true') and.push({ is_starred_on_web: true });

    if (capacityGroup && capacityGroup !== 'all') {
      const groups = splitValues(capacityGroup);
      if (groups.length) and.push({ 'temporaryRental.capacityGroup': { $in: groups } });
    }

    const filter = and.length ? { $and: and } : {};
    const sortObj = order === 'price_asc' ? { 'operations.prices.price': 1 } : order === 'price_desc' ? { 'operations.prices.price': -1 } : { created_at: -1 };

    const result = await PropertyManager.paginate({
      filter,
      opts: { sort: sortObj, limit: parseInt(limit, 10), offset: parseInt(offset, 10) },
      projection: 'id address suite_amount room_amount bathroom_amount operations location photos status type roofed_surface surface total_surface parking_lot_amount is_starred_on_web reference_code created_at guests_amount temporaryRental',
      lean: true,
    });

    res.json({ meta: { limit: parseInt(limit, 10), offset: parseInt(offset, 10), total_count: result.totalDocs }, objects: result.docs });
  } catch (error) {
    next(error);
  }
}

export async function getPropertyById(req, res, next) {
  try {
    const property = await Property.findOne({ id: parseInt(req.params.id, 10) }).lean();
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });
    res.json(property);
  } catch (error) {
    next(error);
  }
}

// Operación destino que puede elegir el usuario al duplicar — 'Alquiler temporal' es el motivo
// principal de esta función (ej. poner en alquiler de temporada una casa que está en venta).
const DUPLICATE_OPERATION_LABELS = { Venta: 'Venta', Alquiler: 'Alquiler', 'Alquiler temporal': 'Alquiler temporario' };

// Copia los archivos de fotos a una carpeta propia para la propiedad nueva (uploads/properties/<newId>/)
// para que la copia sea independiente: borrar/reordenar fotos ahí no debe tocar al original.
// Las URLs externas (Tokko: image_url/thumb_url/original_url) se copian tal cual, no son archivos locales.
function duplicatePhotos(oldId, newId, photos) {
  const oldDir = path.join(UPLOADS_DIR, String(oldId));
  const newDir = path.join(UPLOADS_DIR, String(newId));
  return (photos || []).map((photo) => {
    const copy = { ...photo };
    delete copy._id;
    for (const key of ['local_image', 'local_original', 'local_thumb']) {
      const url = photo[key];
      if (!url) continue;
      const filename = path.basename(url);
      const srcPath = path.join(oldDir, filename);
      if (!fs.existsSync(srcPath)) continue;
      if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(newDir, filename));
      copy[key] = url.replace(`/properties/${oldId}/`, `/properties/${newId}/`);
    }
    return copy;
  });
}

export async function duplicateProperty(req, res, next) {
  try {
    const { id } = req.params;
    const { operation_type } = req.body;
    if (!operation_type || !DUPLICATE_OPERATION_LABELS[operation_type]) {
      return res.status(400).json({ message: 'Elegí a qué operación pasa la copia (Venta, Alquiler o Alquiler temporario).' });
    }

    const original = await Property.findOne({ id: parseInt(id, 10) }).lean();
    if (!original) return res.status(404).json({ message: 'Propiedad no encontrada' });

    const newId = await nextManualPropertyId();
    const photos = duplicatePhotos(original.id, newId, original.photos);
    const isTemporaryRental = /temp/i.test(operation_type);

    const { _id, __v, id: _oldId, createdAt, updatedAt, ...rest } = original;

    const duplicated = await Property.create({
      ...rest,
      id: newId,
      is_manual: true,
      status: 'disponible',
      photos,
      operations: [{ operation_type, prices: [] }],
      has_temporary_rent: isTemporaryRental,
      temporaryRental: undefined,
      public_url: '',
      reference_code: '',
      difusion: {
        mercadolibre: { published: false, url: '', listings: [] },
        zonaprop: { published: false, url: '' },
      },
      lastEditedBy: req.user.id,
      lastEditedAt: new Date(),
      photosEditedAt: photos.length ? new Date() : undefined,
    });

    const operationLabel = DUPLICATE_OPERATION_LABELS[operation_type];
    await Activity.create({
      type: 'property_duplicated',
      description: `${req.user.name} duplicó "${original.publication_title || original.address}" como ${operationLabel} (nueva propiedad #${newId})`,
      userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      entityId: String(newId), entityType: 'property',
      meta: { propertyId: newId, sourcePropertyId: original.id, operationType: operation_type, ...propertyActivitySnapshot(duplicated) },
    });

    res.status(201).json(duplicated);
  } catch (error) {
    next(error);
  }
}

export async function createProperty(req, res, next) {
  try {
    const { address, publication_title, type_name, operation_type, currency, price, location_name, room_amount, bathroom_amount, total_surface } = req.body;
    if (!address) return res.status(400).json({ message: 'La dirección es obligatoria' });
    if (!type_name) return res.status(400).json({ message: 'El tipo de propiedad es obligatorio' });
    if (!operation_type) return res.status(400).json({ message: 'La operación es obligatoria' });

    const property = await Property.create({
      id: await nextManualPropertyId(),
      is_manual: true,
      status: 'disponible',
      created_at: new Date(),
      address,
      publication_title: publication_title || '',
      type: type_name ? { name: type_name } : undefined,
      location: location_name ? { name: location_name } : undefined,
      operations: operation_type ? [{ operation_type, prices: price ? [{ currency: currency || 'USD', price: Number(price) }] : [] }] : [],
      room_amount: room_amount ? Number(room_amount) : undefined,
      bathroom_amount: bathroom_amount ? Number(bathroom_amount) : undefined,
      total_surface: total_surface || undefined,
      lastEditedBy: req.user.id,
      lastEditedAt: new Date(),
    });

    await Activity.create({
      type: 'property_created',
      description: `${req.user.name} agregó manualmente la propiedad "${property.publication_title || property.address}"`,
      userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      entityId: String(property.id), entityType: 'property',
      meta: { propertyId: property.id, ...propertyActivitySnapshot(property) },
    });

    res.status(201).json(property);
  } catch (error) {
    next(error);
  }
}

export async function updateProperty(req, res, next) {
  try {
    const { id } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates._id;

    if (typeof updates.description === 'string') {
      updates.description = sanitizeDescription(updates.description);
    }

    updates.lastEditedBy = req.user.id;
    updates.lastEditedAt = new Date();

    const oldDoc = await Property.findOne({ id: parseInt(id, 10) }).lean();
    if (!oldDoc) return res.status(404).json({ message: 'Propiedad no encontrada' });
    const changes = buildPropertyChanges(oldDoc, updates);

    const property = await Property.findOneAndUpdate({ id: parseInt(id, 10) }, { $set: updates }, { new: true });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    const label = property.address || property.publication_title || `#${property.id}`;
    const description = changes.length === 1
      ? `${req.user.name} cambió "${changes[0].label}" de "${changes[0].from}" a "${changes[0].to}" en "${label}"`
      : changes.length > 1
        ? `${req.user.name} actualizó ${changes.length} campos en "${label}": ${changes.map((c) => c.label).join(', ')}`
        : `${req.user.name} editó la propiedad "${label}"`;

    await Activity.create({
      type: 'property_updated',
      description,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      entityId: String(property.id),
      entityType: 'property',
      meta: { propertyId: property.id, ...propertyActivitySnapshot(property), changes },
    });

    res.json(property);
    triggerMlSync(property).catch((err) => console.error(`No se pudo re-sincronizar la propiedad ${property.id} con MercadoLibre`, err.message));
  } catch (error) {
    next(error);
  }
}

export async function updatePropertyStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['disponible', 'reservada', 'vendida', 'alquilado', 'en_tasacion', 'no_disponible'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Estado inválido' });

    const property = await Property.findOneAndUpdate({ id: parseInt(id, 10) }, { $set: { status, lastEditedBy: req.user.id, lastEditedAt: new Date() } }, { new: true });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    await Activity.create({
      type: 'property_status_changed',
      description: `${req.user.name} cambió el estado de "${property.publication_title || property.address}" a "${status}"`,
      userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      entityId: String(property.id), entityType: 'property',
      meta: { propertyId: property.id, ...propertyActivitySnapshot(property), newStatus: status },
    });

    res.json(property);
    triggerMlSync(property).catch((err) => console.error(`No se pudo re-sincronizar la propiedad ${property.id} con MercadoLibre`, err.message));
  } catch (error) {
    next(error);
  }
}

export async function updatePropertyDifusion(req, res, next) {
  try {
    const { id } = req.params;
    const { platform, published, url } = req.body;
    if (!['mercadolibre', 'zonaprop'].includes(platform)) return res.status(400).json({ message: 'Plataforma inválida' });

    const update = {
      [`difusion.${platform}.published`]: !!published,
      [`difusion.${platform}.url`]: url || '',
      [`difusion.${platform}.updated_at`]: new Date(),
      lastEditedBy: req.user.id,
      lastEditedAt: new Date(),
    };

    const property = await Property.findOneAndUpdate({ id: parseInt(id, 10) }, { $set: update }, { new: true });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    const platformLabel = platform === 'mercadolibre' ? 'MercadoLibre' : 'ZonaProp';
    await Activity.create({
      type: 'property_updated',
      description: `${req.user.name} actualizó la difusión en ${platformLabel} de "${property.publication_title || property.address}"`,
      userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      entityId: String(property.id), entityType: 'property',
      meta: { propertyId: property.id, ...propertyActivitySnapshot(property), platform, published: !!published },
    });

    res.json(property);
  } catch (error) {
    next(error);
  }
}

export async function triggerSync(req, res, next) {
  try {
    res.json({ message: 'Sincronización iniciada en segundo plano' });
    syncWithTokko().then(() => {
      Activity.create({
        type: 'sync_completed',
        description: `Sincronización con Tokko completada (iniciada por ${req.user.name})`,
        userId: req.user.id, userName: req.user.name, entityType: 'system',
      }).catch(console.error);
    }).catch(console.error);
  } catch (error) {
    next(error);
  }
}

export async function importRentals(req, res, next) {
  try {
    if (!fs.existsSync(RENTAL_XLSX_PATH)) {
      return res.status(400).json({ message: `No se encontró el Excel de alquileres en ${RENTAL_XLSX_PATH}. Subilo a esa ruta en el servidor antes de importar.` });
    }

    const summary = await importRentalExcelFile(RENTAL_XLSX_PATH);

    await Activity.create({
      type: 'rentals_imported',
      description: `${req.user.name} importó alquileres temporarios desde Excel (${summary.updated} propiedades actualizadas)`,
      userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      entityType: 'system',
      meta: summary,
    });

    res.json(summary);
  } catch (error) {
    next(error);
  }
}

export async function getPropertyStats(req, res, next) {
  try {
    const [total, byStatus, byType] = await Promise.all([
      Property.countDocuments(),
      Property.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Property.aggregate([{ $group: { _id: '$type.name', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    ]);
    res.json({ total, byStatus, byType });
  } catch (error) {
    next(error);
  }
}

export async function getPropertyLocations(req, res, next) {
  try {
    const props = await Property.find({ geo_lat: { $ne: null }, geo_long: { $ne: null } }, { id: 1, address: 1, geo_lat: 1, geo_long: 1, publication_title: 1, type: 1, photos: 1 }).lean();
    res.json(props.map((p) => ({
      id: p.id,
      name: p.publication_title || 'Sin título',
      address: p.address || '',
      type: p.type?.name || '',
      photo: p.photos?.[0]?.local_image || p.photos?.[0]?.image_url || '',
      loc: { lat: p.geo_lat, lon: p.geo_long },
    })));
  } catch (error) {
    next(error);
  }
}
