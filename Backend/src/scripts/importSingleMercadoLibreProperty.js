import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../utils/db.js';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';
import { nextManualPropertyId } from '../models/Counter.model.js';
import { mlRequest } from '../utils/mercadolibre.service.js';
import { processPhotos } from '../utils/syncWithTokko.js';

dotenv.config();

// Recupera UNA publicación (activa, pausada o cerrada) de la cuenta de MercadoLibre conectada al
// CRM y la carga como propiedad manual (is_manual: true), con fotos descargadas localmente igual
// que el sync de Tokko. Pensado para casos puntuales como "recuperar" un aviso viejo que ya no
// tiene propiedad asociada en el CRM (ver discoverMlItems/matchDiscoveredItems para el caso de
// avisos que SÍ deberían matchear contra una propiedad existente).
async function fetchMlItem(itemId) {
  const { data: item } = await mlRequest('get', `/items/${itemId}`);
  let description = '';
  try {
    const { data: d } = await mlRequest('get', `/items/${itemId}/description`);
    description = d.plain_text || d.text || '';
  } catch (err) {
    console.warn(`No se pudo obtener la descripción del item ${itemId}: ${err.response?.data?.message || err.message}`);
  }
  return { item, description };
}

function findAttr(attributes, id) {
  return (attributes || []).find((a) => a.id === id);
}

function numAttr(attributes, id) {
  const attr = findAttr(attributes, id);
  if (!attr) return undefined;
  const n = parseFloat(attr.value_name);
  return Number.isFinite(n) ? n : undefined;
}

function mapMlItemToProperty(item, description) {
  const attrs = item.attributes || [];
  const opAttr = findAttr(attrs, 'OPERATION');
  const propertyTypeAttr = findAttr(attrs, 'PROPERTY_TYPE');
  const totalArea = numAttr(attrs, 'TOTAL_AREA');
  const coveredArea = numAttr(attrs, 'COVERED_AREA');
  const loc = item.location || {};

  return {
    address: loc.address_line || '',
    publication_title: String(item.title || '').replace(/\s+/g, ' ').trim(),
    description,
    rich_description: description,
    reference_code: findAttr(attrs, 'PROPERTY_CODE')?.value_name || undefined,
    type: propertyTypeAttr ? { name: propertyTypeAttr.value_name } : undefined,
    location: loc.city?.name ? {
      name: loc.neighborhood?.name || loc.city.name,
      full_location: `Argentina | ${loc.state?.name || ''} | ${loc.city.name}`,
      short_location: `${loc.state?.name || ''} | ${loc.city.name}`,
    } : undefined,
    geo_lat: loc.latitude,
    geo_long: loc.longitude,
    operations: opAttr ? [{
      operation_type: opAttr.value_name,
      prices: [{ currency: item.currency_id === 'USD' ? 'USD' : 'ARS', price: item.price }],
    }] : [],
    room_amount: numAttr(attrs, 'ROOMS'),
    suite_amount: numAttr(attrs, 'BEDROOMS'),
    bathroom_amount: numAttr(attrs, 'FULL_BATHROOMS'),
    parking_lot_amount: numAttr(attrs, 'PARKING_LOTS'),
    guests_amount: numAttr(attrs, 'GUESTS'),
    total_surface: totalArea != null ? String(totalArea) : undefined,
    roofed_surface: coveredArea != null ? String(coveredArea) : undefined,
  };
}

async function run() {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error('Uso: node src/scripts/importSingleMercadoLibreProperty.js <item_id_de_ML> (ej. MLA1571234383)');
    process.exit(1);
  }

  await connectDB();

  console.log(`Buscando item ${itemId} en MercadoLibre...`);
  const { item, description } = await fetchMlItem(itemId);

  const alreadyLinked = await Property.findOne({ 'difusion.mercadolibre.listings.item_id': String(item.id) }).lean();
  if (alreadyLinked) {
    console.error(`El item ${item.id} ya está vinculado a la propiedad ${alreadyLinked.id} ("${alreadyLinked.publication_title || alreadyLinked.address}"). No se creó una nueva.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const mapped = mapMlItemToProperty(item, description);
  const propertyId = await nextManualPropertyId();

  const photos = await processPhotos(
    (item.pictures || []).map((p, i) => ({ original: p.secure_url, image: p.secure_url, order: i })),
    propertyId
  );

  const property = await Property.create({
    id: propertyId,
    is_manual: true,
    status: 'disponible',
    created_at: new Date(),
    ...mapped,
    photos,
  });

  await Activity.create({
    type: 'property_created',
    description: `Propiedad "${property.publication_title || property.address}" recuperada desde MercadoLibre (item ${item.id}, estado original: ${item.status}) y cargada manualmente en el CRM`,
    entityId: String(property.id),
    entityType: 'property',
    meta: { propertyId: property.id, ml_item_id: item.id, ml_status: item.status },
  });

  console.log(`Propiedad ${property.id} creada: "${property.publication_title || property.address}" — ${photos.length} fotos descargadas.`);
  await mongoose.disconnect();
  console.log('Listo.');
}

run().catch(async (err) => {
  console.error(err.response?.data || err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
