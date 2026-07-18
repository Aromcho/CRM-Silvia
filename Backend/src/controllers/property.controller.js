import fs from 'fs';
import Property from '../models/Property.model.js';
import PropertyManager from '../manager/property.manager.js';
import Activity from '../models/Activity.model.js';
import { syncWithTokko } from '../utils/syncWithTokko.js';
import { importRentalExcelFile, RENTAL_XLSX_PATH } from '../utils/rentalExcelImporter.js';

const normalizeText = (v = '') => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const escapeRegex = (v = '') => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitValues = (value) => {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((i) => String(i).split(',')).map((i) => i.trim()).filter(Boolean);
};

const OPERATION_ALIASES = {
  venta: ['Venta', 'Sale'], comprar: ['Venta', 'Sale'],
  alquiler: ['Alquiler', 'Rent'],
  'alquiler temporal': ['Alquiler', 'Alquiler temporal', 'Alquiler Temporario', 'Temporary Rent'],
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

export async function createProperty(req, res, next) {
  try {
    const { address, publication_title, type_name, operation_type, currency, price, location_name, room_amount, bathroom_amount, total_surface } = req.body;
    if (!address) return res.status(400).json({ message: 'La dirección es obligatoria' });

    const property = await Property.create({
      id: Date.now(),
      is_manual: true,
      status: 'disponible',
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
      meta: { propertyId: property.id },
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

    updates.lastEditedBy = req.user.id;
    updates.lastEditedAt = new Date();

    const property = await Property.findOneAndUpdate({ id: parseInt(id, 10) }, { $set: updates }, { new: true });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    await Activity.create({
      type: 'property_updated',
      description: `${req.user.name} editó la propiedad "${property.publication_title || property.address}"`,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      entityId: String(property.id),
      entityType: 'property',
      meta: { propertyId: property.id, changes: Object.keys(updates) },
    });

    res.json(property);
  } catch (error) {
    next(error);
  }
}

export async function updatePropertyStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['disponible', 'reservada', 'vendida', 'en_tasacion', 'no_disponible'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Estado inválido' });

    const property = await Property.findOneAndUpdate({ id: parseInt(id, 10) }, { $set: { status, lastEditedBy: req.user.id, lastEditedAt: new Date() } }, { new: true });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    await Activity.create({
      type: 'property_status_changed',
      description: `${req.user.name} cambió el estado de "${property.publication_title || property.address}" a "${status}"`,
      userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      entityId: String(property.id), entityType: 'property',
      meta: { propertyId: property.id, newStatus: status },
    });

    res.json(property);
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
      meta: { propertyId: property.id, platform, published: !!published },
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
