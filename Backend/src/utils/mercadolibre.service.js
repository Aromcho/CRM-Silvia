import axios from 'axios';
import MlToken from '../models/MlToken.model.js';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';

// Documentación: https://developers.mercadolibre.com.ar/
const ML_API = 'https://api.mercadolibre.com';
const SITE_ID = 'MLA';

function redirectUri() {
  const base = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/api/mercadolibre/oauth/callback`;
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.ML_CLIENT_ID,
    redirect_uri: redirectUri(),
    state,
  });
  return `https://auth.mercadolibre.com.ar/authorization?${params.toString()}`;
}

async function saveToken(data) {
  const expires_at = new Date(Date.now() + (data.expires_in - 60) * 1000);
  return MlToken.findOneAndUpdate(
    {},
    {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      ml_user_id: data.user_id,
      expires_at,
    },
    { upsert: true, new: true }
  );
}

export async function exchangeCodeForToken(code) {
  const { data } = await axios.post(
    `${ML_API}/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(),
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  await saveToken(data);
  return data;
}

async function refreshAccessToken(token) {
  const { data } = await axios.post(
    `${ML_API}/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      refresh_token: token.refresh_token,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  // ML rota el refresh_token en cada uso: hay que persistir el nuevo, el viejo deja de servir
  await saveToken(data);
  return data;
}

export async function isConnected() {
  const token = await MlToken.findOne({}).lean();
  return !!token;
}

export async function getValidAccessToken() {
  const token = await MlToken.findOne({});
  if (!token) throw new Error('MercadoLibre no está conectado. Autorizá la cuenta en GET /api/mercadolibre/oauth/connect');
  if (token.expires_at > new Date(Date.now() + 30_000)) return token.access_token;
  try {
    const refreshed = await refreshAccessToken(token);
    return refreshed.access_token;
  } catch (err) {
    // Si el refresh_token fue revocado no hay forma de recuperarse sola: hay que avisar para que alguien reconecte la cuenta
    await Activity.create({
      type: 'ml_token_error',
      description: `No se pudo renovar el token de MercadoLibre (${err.response?.data?.message || err.message}). Reconectá la cuenta en /api/mercadolibre/oauth/connect.`,
      entityType: 'system',
    }).catch((activityErr) => console.error('No se pudo registrar la actividad de error de token ML', activityErr.message));
    throw new Error('El token de MercadoLibre expiró y no se pudo renovar. Hay que reconectar la cuenta.');
  }
}

async function mlRequest(method, path, opts = {}) {
  const access_token = await getValidAccessToken();
  return axios({
    method,
    url: `${ML_API}${path}`,
    headers: { Authorization: `Bearer ${access_token}` },
    ...opts,
  });
}

export async function fetchNotificationResource(resource) {
  const access_token = await getValidAccessToken();
  const { data } = await axios.get(`${ML_API}${resource}`, { headers: { Authorization: `Bearer ${access_token}` } });
  return data;
}

// --- Descubrimiento dinámico de categoría/atributos ---
// No hardcodeamos IDs de categoría/atributos: se resuelven contra la API real
// y se cachean en memoria, para no depender de que la doc que conozco esté actualizada.

let categoryTreeCache = null;
let categoryTreeCachedAt = 0;
const CATEGORY_TREE_TTL = 24 * 60 * 60 * 1000;

async function getRealEstateCategories() {
  const now = Date.now();
  if (categoryTreeCache && now - categoryTreeCachedAt < CATEGORY_TREE_TTL) return categoryTreeCache;
  const { data: siteCategories } = await mlRequest('get', `/sites/${SITE_ID}/categories`);
  const inmuebles = siteCategories.find((c) => /inmueble/i.test(c.name));
  if (!inmuebles) throw new Error('No se encontró la categoría "Inmuebles" en el árbol de categorías de MercadoLibre');
  const { data: detail } = await mlRequest('get', `/categories/${inmuebles.id}`);
  categoryTreeCache = detail.children_categories || [];
  categoryTreeCachedAt = now;
  return categoryTreeCache;
}

const TYPE_KEYWORDS = {
  departamento: ['departamento'],
  casa: ['casa'],
  ph: ['ph'],
  terreno: ['terreno', 'lote'],
  oficina: ['oficina'],
  local: ['local comercial', 'local'],
  cochera: ['cochera', 'garage', 'garaje'],
  galpon: ['galpón', 'galpon', 'depósito', 'deposito', 'nave'],
  quinta: ['quinta', 'campo'],
};

export async function resolveCategoryId(property) {
  const categories = await getRealEstateCategories();
  const typeName = (property.type?.name || '').toLowerCase();
  for (const keywords of Object.values(TYPE_KEYWORDS)) {
    if (keywords.some((kw) => typeName.includes(kw))) {
      const match = categories.find((c) => keywords.some((kw) => c.name.toLowerCase().includes(kw)));
      if (match) return match.id;
    }
  }
  const direct = typeName && categories.find((c) => c.name.toLowerCase().includes(typeName));
  if (direct) return direct.id;
  throw new Error(`No se pudo mapear el tipo de propiedad "${property.type?.name}" a una categoría de MercadoLibre`);
}

const attributesCache = new Map();

async function getCategoryAttributes(categoryId) {
  if (attributesCache.has(categoryId)) return attributesCache.get(categoryId);
  const { data } = await mlRequest('get', `/categories/${categoryId}/attributes`);
  attributesCache.set(categoryId, data);
  return data;
}

const categoryDetailCache = new Map();
const DEFAULT_MAX_PICTURES = 10; // fallback solo si la categoría no informa el campo (no debería pasar)

async function getCategoryMaxPictures(categoryId) {
  if (categoryDetailCache.has(categoryId)) return categoryDetailCache.get(categoryId);
  const { data } = await mlRequest('get', `/categories/${categoryId}`);
  const max = data.settings?.max_pictures_per_item || DEFAULT_MAX_PICTURES;
  categoryDetailCache.set(categoryId, max);
  return max;
}

function findAttr(attributes, id) {
  return attributes.find((a) => a.id === id);
}

// Para atributos de tipo lista (ej. OPERATION), matchea por nombre visible en vez de
// asumir un value_id fijo, porque esos IDs varían y no los puedo confirmar sin acceso a la doc.
function matchListValue(attr, textCandidates) {
  const options = attr?.values || attr?.possible_values || [];
  for (const candidate of textCandidates) {
    const found = options.find((v) => v.name?.toLowerCase() === candidate.toLowerCase());
    if (found) return found.id;
  }
  return null;
}

// Solo Venta y Alquiler "estándar" se publican como aviso normal en ML — Alquiler temporal
// tiene su propio circuito en el CRM (sección Alquileres temporarios) y no corresponde acá.
function getPublishableOperations(property) {
  const byType = new Map();
  for (const op of property.operations || []) {
    if (!op.prices?.length) continue;
    if (/temporal/i.test(op.operation_type)) continue;
    let type = null;
    if (/venta/i.test(op.operation_type)) type = 'venta';
    else if (/alquiler/i.test(op.operation_type)) type = 'alquiler';
    if (!type || byType.has(type)) continue;
    byType.set(type, op);
  }
  return [...byType.entries()].map(([type, operation]) => ({ type, operation }));
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, '').trim();
}

function extractMlError(err) {
  const mlError = err.response?.data;
  return mlError ? JSON.stringify(mlError) : err.message;
}

export async function mapPropertyToMlItem(property, operationType, operation) {
  const categoryId = await resolveCategoryId(property);
  const attributes = await getCategoryAttributes(categoryId);
  const maxPictures = await getCategoryMaxPictures(categoryId);
  const price = operation.prices[0];

  const attrPayload = [];
  const opAttr = findAttr(attributes, 'OPERATION');
  if (opAttr) {
    const valueId = matchListValue(opAttr, operationType === 'venta' ? ['Venta'] : ['Alquiler', 'Alquiler temporal']);
    if (valueId) attrPayload.push({ id: 'OPERATION', value_id: valueId });
  }
  const propertyTypeAttr = findAttr(attributes, 'PROPERTY_TYPE');
  if (propertyTypeAttr && property.type?.name) {
    const valueId = matchListValue(propertyTypeAttr, [property.type.name]);
    if (valueId) attrPayload.push({ id: 'PROPERTY_TYPE', value_id: valueId });
  }
  if (findAttr(attributes, 'ROOMS') && property.room_amount) {
    attrPayload.push({ id: 'ROOMS', value_name: String(property.room_amount) });
  }
  if (findAttr(attributes, 'BEDROOMS') && property.suite_amount) {
    attrPayload.push({ id: 'BEDROOMS', value_name: String(property.suite_amount) });
  }
  if (findAttr(attributes, 'FULL_BATHROOMS') && property.bathroom_amount) {
    attrPayload.push({ id: 'FULL_BATHROOMS', value_name: String(property.bathroom_amount) });
  }
  if (findAttr(attributes, 'TOTAL_AREA') && property.total_surface) {
    attrPayload.push({ id: 'TOTAL_AREA', value_name: `${parseFloat(property.total_surface)} m²` });
  }
  if (findAttr(attributes, 'COVERED_AREA') && property.roofed_surface) {
    attrPayload.push({ id: 'COVERED_AREA', value_name: `${parseFloat(property.roofed_surface)} m²` });
  }

  const base = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
  const pictures = (property.photos || [])
    .filter((p) => p.local_image)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(0, maxPictures)
    .map((p) => ({ source: `${base}${p.local_image}` }));

  return {
    title: (property.publication_title || property.address || 'Propiedad').slice(0, 60),
    category_id: categoryId,
    price: price.price,
    currency_id: price.currency === 'USD' ? 'USD' : 'ARS',
    // TODO: confirmar buying_mode/listing_type_id contra la respuesta real de ML para la categoría Inmuebles
    // (varía según el modelo de clasificados vigente para la cuenta). Si el POST /items falla, el
    // mensaje de error de ML indica exactamente qué campo/valor corregir.
    buying_mode: 'classified',
    condition: 'not_specified',
    available_quantity: 1,
    pictures,
    attributes: attrPayload,
    location:
      property.geo_lat && property.geo_long
        ? {
            latitude: property.geo_lat,
            longitude: property.geo_long,
            address_line: property.address,
            city: { name: property.location?.name },
            state: { name: property.location?.state },
          }
        : undefined,
  };
}

async function publishListing(propertyDoc, operationType, operation) {
  const item = await mapPropertyToMlItem(propertyDoc, operationType, operation);
  const { data } = await mlRequest('post', '/items', { data: item });
  const description = stripHtml(propertyDoc.description || propertyDoc.rich_description);
  if (description) {
    try {
      await mlRequest('post', `/items/${data.id}/description`, { data: { plain_text: description } });
    } catch (descErr) {
      console.error('No se pudo setear la descripción en ML', descErr.response?.data || descErr.message);
    }
  }
  return { operation_type: operationType, item_id: data.id, category_id: item.category_id, url: data.permalink, status: 'active' };
}

async function updateListingPrice(itemId, operation) {
  const price = operation.prices[0];
  await mlRequest('put', `/items/${itemId}`, {
    data: { price: price.price, currency_id: price.currency === 'USD' ? 'USD' : 'ARS' },
  });
}

async function setListingStatus(itemId, status) {
  await mlRequest('put', `/items/${itemId}`, { data: { status } });
}

async function saveListingsState(propertyId, listings) {
  const published = listings.some((l) => l.status === 'active');
  const primary = listings.find((l) => l.status === 'active') || listings[0];
  const withError = listings.find((l) => l.last_error);
  await Property.updateOne(
    { id: propertyId },
    {
      $set: {
        'difusion.mercadolibre.listings': listings,
        'difusion.mercadolibre.published': published,
        'difusion.mercadolibre.url': primary?.url || '',
        'difusion.mercadolibre.updated_at': new Date(),
        'difusion.mercadolibre.last_error': withError?.last_error || null,
      },
    }
  );
}

// Orquestador principal: crea/actualiza un item de ML por cada operación vigente (venta y/o alquiler
// pueden convivir en la misma propiedad), pausa las que dejaron de aplicar, y cierra todo si se dio de baja.
export async function syncProperty(propertyDoc) {
  const existingListings = (propertyDoc.difusion?.mercadolibre?.listings || []).map((l) =>
    l.toObject ? l.toObject() : { ...l }
  );
  const listingsByType = new Map(existingListings.map((l) => [l.operation_type, l]));

  if (propertyDoc.deleted_at) {
    for (const listing of listingsByType.values()) {
      if (listing.item_id && listing.status !== 'closed') {
        try {
          await setListingStatus(listing.item_id, 'closed');
          listing.status = 'closed';
          listing.last_error = null;
        } catch (err) {
          listing.last_error = extractMlError(err);
        }
        listing.updated_at = new Date();
      }
    }
    const finalListings = [...listingsByType.values()];
    await saveListingsState(propertyDoc.id, finalListings);
    return { closed: true, listings: finalListings };
  }

  const targetOps = propertyDoc.status === 'disponible' ? getPublishableOperations(propertyDoc) : [];
  const targetTypes = new Set(targetOps.map((o) => o.type));

  for (const { type, operation } of targetOps) {
    const existing = listingsByType.get(type);
    try {
      if (existing?.item_id) {
        await updateListingPrice(existing.item_id, operation);
        if (existing.status !== 'active') await setListingStatus(existing.item_id, 'active');
        existing.status = 'active';
        existing.last_error = null;
        existing.updated_at = new Date();
      } else {
        const published = await publishListing(propertyDoc, type, operation);
        listingsByType.set(type, { ...published, last_error: null, updated_at: new Date() });
      }
    } catch (err) {
      const listing = listingsByType.get(type) || { operation_type: type, status: 'active' };
      listing.last_error = extractMlError(err);
      listing.updated_at = new Date();
      listingsByType.set(type, listing);
    }
  }

  // Propiedad no disponible (vendida/reservada/no_disponible), u operación que ya no está vigente: pausar, no cerrar
  for (const [type, listing] of listingsByType) {
    if (!targetTypes.has(type) && listing.item_id && listing.status === 'active') {
      try {
        await setListingStatus(listing.item_id, 'paused');
        listing.status = 'paused';
        listing.last_error = null;
      } catch (err) {
        listing.last_error = extractMlError(err);
      }
      listing.updated_at = new Date();
    }
  }

  const finalListings = [...listingsByType.values()];
  await saveListingsState(propertyDoc.id, finalListings);
  const withError = finalListings.find((l) => l.last_error);
  if (withError) throw new Error(withError.last_error);
  return { listings: finalListings };
}

// Sync masivo con throttling para no pegarle a la API de ML sin pausa (rate limits).
// Corre secuencial y de a una propiedad; se corta apenas el token deja de servir, porque
// seguir insistiendo por cada propiedad restante no tiene sentido si hay que reconectar la cuenta.
export async function syncAllProperties({ delayMs = 1200 } = {}) {
  const properties = await Property.find({ deleted_at: { $exists: false } }).lean();
  const results = { total: properties.length, ok: 0, failed: 0, errors: [] };
  for (const property of properties) {
    try {
      await syncProperty(property);
      results.ok += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ id: property.id, error: err.message });
      if (/no está conectado|reconectar/i.test(err.message)) break;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return results;
}
