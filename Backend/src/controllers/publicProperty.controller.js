import Property from '../models/Property.model.js';

// Proyección explícita (allow-list): solo lo que la web pública necesita.
// Deja afuera a propósito internal_data (dueños), notes, lastEditedBy/At, difusion,
// is_manual y temporaryRental completo (no lo consume el frontend de la web hoy y
// trae ownerPhone/alarmCode, que no deben salir de la red interna del CRM).
const PUBLIC_FIELDS = [
  'id', 'address', 'address_complement', 'age', 'apartment_door', 'appartments_per_floor',
  'bathroom_amount', 'block_number', 'branch', 'building', 'cleaning_tax', 'common_area',
  'covered_parking_lot', 'created_at', 'credit_eligible', 'custom1', 'custom_tags',
  'depth_measure', 'description', 'dining_room', 'disposition', 'down_payment', 'expenses',
  'extra_attributes', 'fake_address', 'files', 'fire_insurance_cost', 'floor', 'floors_amount',
  'front_measure', 'geo_lat', 'geo_long', 'gm_location_type', 'guests_amount',
  'has_temporary_rent', 'iptu', 'iptu_type', 'is_starred_on_web', 'legally_checked',
  'livable_area', 'living_amount', 'location', 'lot_number', 'occupation', 'operations',
  'orientation', 'parking_lot_amount', 'parking_lot_condition', 'parking_lot_type', 'photos',
  'portal_footer', 'private_area', 'producer', 'property_condition', 'public_url',
  'publication_title', 'real_address', 'reference_code', 'rich_description', 'roofed_surface',
  'room_amount', 'semiroofed_surface', 'seo_description', 'seo_keywords', 'situation', 'status',
  'suite_amount', 'suites_with_closets', 'surface', 'surface_measurement', 'tags',
  'toilet_amount', 'total_area', 'total_suites', 'total_surface', 'transaction_requirements',
  'tv_rooms', 'type', 'uncovered_parking_lot', 'unroofed_surface', 'videos', 'web_price',
  'zonification', 'createdAt', 'updatedAt',
].join(' ');

// El status interno del CRM tiene 2 valores que la web no conoce: en_tasacion (nunca se
// expone, es una propiedad sin tasar aún) y no_disponible (se traduce a "vendida", que es
// como la web ya mostraba el status 4 de Tokko antes de este cambio).
function mapStatus(status) {
  if (status === 'no_disponible') return 'vendida';
  return status;
}

function toPublicJson(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.status = mapStatus(obj.status);
  return obj;
}

export async function getPublicProperties(req, res, next) {
  try {
    const { updatedSince, limit = 500, offset = 0 } = req.query;

    const filter = { status: { $ne: 'en_tasacion' } };
    if (updatedSince) {
      const since = new Date(updatedSince);
      if (!isNaN(since.getTime())) filter.updatedAt = { $gt: since };
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 500, 500);
    const parsedOffset = parseInt(offset, 10) || 0;

    const [docs, total_count] = await Promise.all([
      Property.find(filter, PUBLIC_FIELDS).sort({ updatedAt: 1 }).skip(parsedOffset).limit(parsedLimit),
      Property.countDocuments(filter),
    ]);

    res.json({
      meta: { limit: parsedLimit, offset: parsedOffset, total_count },
      objects: docs.map(toPublicJson),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPublicPropertyIds(req, res, next) {
  try {
    const ids = await Property.find({ status: { $ne: 'en_tasacion' } }, 'id').distinct('id');
    res.json({ ids });
  } catch (error) {
    next(error);
  }
}
