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

export async function mlRequest(method, path, opts = {}) {
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

// El detalle de un lead tipo "question" no trae el texto de la pregunta — hay que consultarlo aparte
// contra la API de preguntas usando el external_id del lead como question_id (confirmado en la doc de Leads).
export async function getQuestionText(questionId) {
  const { data } = await mlRequest('get', `/questions/${questionId}?api_version=4`);
  return data.text || '';
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

let listingTypesCache = null;
let listingTypesCachedAt = 0;

// Niveles de destaque disponibles (Plata/Oro/Oro Premium para inmuebles y vehículos) — se piden
// dinámicamente en vez de hardcodear nombres, porque varían por sitio/categoría.
export async function getListingTypes() {
  const now = Date.now();
  if (listingTypesCache && now - listingTypesCachedAt < CATEGORY_TREE_TTL) return listingTypesCache;
  const { data } = await mlRequest('get', `/sites/${SITE_ID}/listing_types`);
  listingTypesCache = data;
  listingTypesCachedAt = now;
  return data;
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
  // Obligatorio en Inmuebles según la doc de ML (confirmado vía WebSearch): expensas mensuales
  if (findAttr(attributes, 'MAINTENANCE_FEE') && property.expenses) {
    attrPayload.push({ id: 'MAINTENANCE_FEE', value_name: String(property.expenses) });
  }
  // TODO: IS_SUITABLE_FOR_PETS también es obligatorio para Inmuebles y no hay campo equivalente
  // en Property.model.js (temporaryRental.mascotas es de otro circuito). Si el POST/validate lo pide,
  // hay que agregar el campo al modelo o decidir un valor por defecto (no asumirlo a ciegas).

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
    buying_mode: 'classified', // confirmado por doc de ML para clasificados (inmuebles/vehículos)
    // TODO: "silver" es un ejemplo encontrado por WebSearch, no confirmado específicamente para
    // Inmuebles Argentina. /items/validate (usado en publishListing) va a decir si hay que cambiarlo.
    listing_type_id: 'silver',
    condition: 'not_specified',
    available_quantity: 1,
    official_store_id: null, // obligatorio en null si la cuenta no es Tienda Oficial (confirmado por doc)
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
  // Chequea el payload completo contra ML sin crear el aviso real — evita publicar (y potencialmente
  // pagar) un item mal armado mientras todavía estamos afinando el mapeo de atributos/categoría.
  await mlRequest('post', '/items/validate', { data: item });
  const { data } = await mlRequest('post', '/items', { data: item });
  const description = stripHtml(propertyDoc.description || propertyDoc.rich_description);
  if (description) {
    try {
      await mlRequest('post', `/items/${data.id}/description`, { data: { plain_text: description } });
    } catch (descErr) {
      console.error('No se pudo setear la descripción en ML', descErr.response?.data || descErr.message);
    }
  }
  return {
    operation_type: operationType,
    item_id: data.id,
    category_id: item.category_id,
    url: data.permalink,
    status: 'active',
    listing_type_id: item.listing_type_id,
  };
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

// Sube/baja el nivel de destaque de un aviso ya publicado (Plata/Oro/Oro Premium). Tiene costo real
// en ML (consume cupo o tiene cargo adicional), por eso es una acción explícita del usuario, no automática.
export async function upgradeListingType(propertyId, operationType, listingTypeId) {
  const property = await Property.findOne({ id: propertyId }).lean();
  const listing = property?.difusion?.mercadolibre?.listings?.find((l) => l.operation_type === operationType);
  if (!listing?.item_id) throw new Error('Esa operación todavía no tiene un aviso publicado en MercadoLibre');
  await mlRequest('put', `/items/${listing.item_id}`, { data: { listing_type_id: listingTypeId } });
  await Property.updateOne(
    { id: propertyId, 'difusion.mercadolibre.listings.operation_type': operationType },
    {
      $set: {
        'difusion.mercadolibre.listings.$.listing_type_id': listingTypeId,
        'difusion.mercadolibre.listings.$.updated_at': new Date(),
      },
    }
  );
  const updated = await Property.findOne({ id: propertyId }, { difusion: 1 }).lean();
  return updated.difusion?.mercadolibre?.listings || [];
}

// Etiquetas legibles para los goals confirmados en la doc real de "Calidad de las Publicaciones - Inmuebles"
const HEALTH_GOAL_LABELS = {
  picture: (goal) => `Agregar más fotos${goal.data?.min ? ` (mínimo ${goal.data.min})` : ''}`,
  technical_specification: () => 'Completar los atributos técnicos de la publicación',
  video: () => 'Agregar un video o tour virtual (campo video_id)',
  upgrade_listing: () => 'Mejorar el nivel de destaque de la publicación',
  publish: () => 'Publicar el aviso',
};

// GET /items/{id}/health → { item_id, health (0-1), level, goals: [{id, name, apply, progress, progress_max, data?}] }
// Confirmado 2026-07-21 contra la doc real "Calidad de las Publicaciones - Inmuebles" que pegó el usuario.
export async function refreshListingHealth(itemId) {
  let data;
  try {
    ({ data } = await mlRequest('get', `/items/${itemId}/health`));
  } catch (err) {
    // Pasa si el item es de un desarrollo (domain_id con "DEVELOPMENT") o no está activo/tiene penalización:
    // no es un error real del sync, simplemente no aplica calidad a este item.
    if (/health is not supported/i.test(err.response?.data?.message || '')) {
      return { health_percentage: null, health_actions: [], health_checked_at: new Date() };
    }
    throw new Error(`No se pudo obtener la calidad de la publicación: ${extractMlError(err)}`);
  }
  const health_percentage = data.health == null ? null : Math.round(data.health * 100);
  const pendingGoals = (data.goals || []).filter((g) => g.apply && g.progress < g.progress_max);
  const health_actions = pendingGoals.map((g) => (HEALTH_GOAL_LABELS[g.id]?.(g)) || g.name || g.id);
  return { health_percentage, health_actions, health_checked_at: new Date() };
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

  // Nota: `deleted_at` viene de Tokko y NO indica que la propiedad fue dada de baja (lo trae
  // prácticamente cualquier propiedad, incluidas las disponibles). Las bajas reales ya se manejan
  // solas: si Tokko deja de devolver la propiedad, syncWithTokko la borra de nuestra base, y
  // syncToMercadoLibre ya responde 404 antes de llegar acá. Por eso no hace falta chequearlo aquí.

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

  // Calidad/recomendaciones: solo para listings activos, y sin frenar el sync si falla (no es crítico)
  for (const [, listing] of listingsByType) {
    if (listing.item_id && listing.status === 'active') {
      try {
        Object.assign(listing, await refreshListingHealth(listing.item_id));
      } catch (err) {
        console.error(`No se pudo actualizar la calidad del item ${listing.item_id}`, err.message);
      }
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

// --- Descubrir publicaciones ya existentes (ej. las que subió Tokko directamente) y vincularlas ---
// sin crear nada nuevo en ML, para no terminar con avisos duplicados de la misma propiedad.

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchMlUserId() {
  const token = await MlToken.findOne({}).lean();
  if (!token?.ml_user_id) throw new Error('MercadoLibre no está conectado');
  return token.ml_user_id;
}

// Trae TODOS los items (cualquier categoría) que ya tiene publicados la cuenta conectada, con
// los datos mínimos para poder matchearlos contra las propiedades del CRM.
export async function discoverMlItems() {
  const userId = await fetchMlUserId();
  const itemIds = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const { data } = await mlRequest('get', `/users/${userId}/items/search?limit=${limit}&offset=${offset}`);
    itemIds.push(...(data.results || []));
    offset += limit;
    if (!data.paging || offset >= data.paging.total) break;
  }

  const items = [];
  for (const group of chunkArray(itemIds, 20)) {
    const { data } = await mlRequest(
      'get',
      `/items?ids=${group.join(',')}&attributes=id,title,permalink,seller_custom_field,category_id,status,attributes`
    );
    for (const entry of data) {
      const body = entry.body || entry;
      const opAttr = (body.attributes || []).find((a) => a.id === 'OPERATION');
      items.push({
        item_id: body.id,
        title: body.title,
        permalink: body.permalink,
        seller_custom_field: body.seller_custom_field || null,
        category_id: body.category_id,
        status: body.status,
        operation_value: opAttr?.value_name || null,
      });
    }
  }
  return items;
}

// Matchea cada item de ML contra una propiedad del CRM. Prioridad: seller_custom_field (si Tokko
// guardó ahí su propio ID/referencia) > coincidencia de título. Todo lo demás queda "sin matchear"
// para revisión manual — nunca se auto-vincula nada acá, eso lo confirma el usuario aparte.
export async function matchDiscoveredItems() {
  const items = await discoverMlItems();
  const properties = await Property.find(
    {},
    { id: 1, reference_code: 1, publication_title: 1, address: 1, 'difusion.mercadolibre': 1 }
  ).lean();

  const byTokkoId = new Map(properties.map((p) => [String(p.id), p]));
  const byRefCode = new Map(properties.filter((p) => p.reference_code).map((p) => [normalizeText(p.reference_code), p]));

  const matches = [];
  const unmatchedMlItems = [];
  for (const item of items) {
    let property = null;
    let matchedBy = null;

    if (item.seller_custom_field) {
      property = byTokkoId.get(String(item.seller_custom_field)) || byRefCode.get(normalizeText(item.seller_custom_field));
      if (property) matchedBy = 'seller_custom_field';
    }
    if (!property) {
      const normTitle = normalizeText(item.title);
      property = properties.find((p) => {
        const normProp = normalizeText(p.publication_title) || normalizeText(p.address);
        if (!normProp || !normTitle) return false;
        const shorter = normProp.length < normTitle.length ? normProp : normTitle;
        const longer = normProp.length < normTitle.length ? normTitle : normProp;
        return shorter.length >= 8 && longer.includes(shorter.slice(0, Math.min(shorter.length, 40)));
      });
      if (property) matchedBy = 'title';
    }

    if (property) {
      const alreadyLinked = (property.difusion?.mercadolibre?.listings || []).some(
        (l) => l.item_id === String(item.item_id)
      );
      matches.push({
        item_id: item.item_id,
        title: item.title,
        permalink: item.permalink,
        status: item.status,
        operation_value: item.operation_value,
        propertyId: property.id,
        propertyTitle: property.publication_title || property.address,
        matchedBy,
        alreadyLinked,
      });
    } else {
      unmatchedMlItems.push(item);
    }
  }

  // Una misma propiedad puede tener varios avisos viejos cerrados/vencidos con el mismo título en
  // ML (se van acumulando con el tiempo). Si para una propiedad hay al menos un aviso "active",
  // los cerrados son ruido histórico: no tiene sentido ofrecerlos para vincular y llevan a
  // vincular por error el vencido en lugar del vigente (pasó con IDs reales, ver PR/incidente).
  const hasActiveByProperty = new Map();
  for (const m of matches) {
    if (m.status === 'active') hasActiveByProperty.set(m.propertyId, true);
  }
  const filteredMatches = matches.filter(
    (m) => m.status === 'active' || !hasActiveByProperty.get(m.propertyId)
  );

  return { matches: filteredMatches, unmatchedMlItems };
}

// Escribe el vínculo confirmado por el usuario — NO publica ni modifica nada en ML, solo guarda
// el item_id existente en difusion.mercadolibre.listings para que syncProperty() haga PUT en vez de POST.
export async function linkExistingListing(propertyId, itemId, operationValue) {
  const operationType = /alquiler/i.test(operationValue || '') ? 'alquiler' : 'venta';
  const { data: item } = await mlRequest('get', `/items/${itemId}`);
  await Property.updateOne(
    { id: propertyId, 'difusion.mercadolibre.listings.operation_type': { $ne: operationType } },
    {
      $push: {
        'difusion.mercadolibre.listings': {
          operation_type: operationType,
          item_id: String(itemId),
          category_id: item.category_id,
          url: item.permalink,
          status: item.status === 'active' ? 'active' : 'paused',
          listing_type_id: item.listing_type_id,
          updated_at: new Date(),
        },
      },
    }
  );
  await Property.updateOne(
    { id: propertyId },
    {
      $set: {
        'difusion.mercadolibre.published': true,
        'difusion.mercadolibre.url': item.permalink,
        'difusion.mercadolibre.updated_at': new Date(),
      },
    }
  );
}
