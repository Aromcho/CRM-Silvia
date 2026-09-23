import axios from 'axios';
import ZpToken from '../models/ZpToken.model.js';
import Property from '../models/Property.model.js';
import { getBackendPublicUrl } from './publicUrl.js';

// Documentación: open-classifieds.notion.site/arg + Swagger real en {base}/swagger-ui-init.js
// Ver CRM/PLAN_ZONAPROP.md para el plan completo.

// Se lee en cada llamada, no una const de módulo: ver [[project_esm_dotenv_order_bug]] —
// los imports ESM se evalúan antes que dotenv.config() en index.js.
function zpApiBase() {
  return (process.env.ZP_API_BASE || '').replace(/\/$/, '');
}

export function codigoInmobiliaria() {
  return process.env.ZP_CODIGO_INMOBILIARIA;
}

// La API de Navent nunca devuelve la URL pública del aviso (relevado a fondo: ni en el aviso
// completo, ni en /status, ni en /avisos/online/resumen — solo URLs de imágenes). Confirmado en
// vivo 2026-09-07 contra la web real de ZonaProp: la URL con slug genérico + idAvisoNavplat
// resuelve igual a la página real (ZonaProp no valida el slug, solo el ID numérico al final).
export function buildAvisoUrl(idAvisoNavplat) {
  if (!idAvisoNavplat) return '';
  return `https://www.zonaprop.com.ar/propiedades/clasificado/propiedad-${idAvisoNavplat}.html`;
}

async function login() {
  const { data } = await axios.post(`${zpApiBase()}/v1/application/login`, null, {
    params: {
      grant_type: 'client_credentials',
      client_id: process.env.ZP_CLIENT_ID,
      client_secret: process.env.ZP_CLIENT_SECRET,
    },
  });
  // El token dura ~10 años en sandbox (expires_in gigante), pero igual lo tratamos como si
  // pudiera expirar: no cachear "para siempre" sin control (mismo criterio que MlToken).
  const expires_at = new Date(Date.now() + (data.expires_in - 60) * 1000);
  await ZpToken.findOneAndUpdate(
    {},
    { access_token: data.access_token, token_type: data.token_type, scope: data.scope, expires_at },
    { upsert: true, new: true }
  );
  return data.access_token;
}

export async function getValidAccessToken() {
  const token = await ZpToken.findOne({});
  if (token && token.expires_at > new Date(Date.now() + 30_000)) return token.access_token;
  return login();
}

// El Swagger declara el securityScheme como ApiKeyAuth (apiKey, in: query, name: access_token)
// en TODOS los endpoints. Probado en vivo 2026-09-02: el header "Authorization: Bearer" da
// 401 invalid_token en los endpoints inmobiliaria-scoped (/disponibilidad, /avisos/online/resumen)
// aunque el mismo token funcione ahí con /v1/inmobiliarias y /v1/tipopropiedades (esos son
// permisivos, no es que el header sea el método correcto). El query param es el único método
// que funciona de manera consistente en todos los endpoints — no usar el header.
export async function zpRequest(method, path, opts = {}) {
  const access_token = await getValidAccessToken();
  const withToken = (token) => ({
    method,
    url: `${zpApiBase()}${path}`,
    ...opts,
    params: { ...opts.params, access_token: token },
  });
  try {
    return await axios(withToken(access_token));
  } catch (err) {
    // client_credentials no tiene refresh_token: si el token fue revocado/expiró antes de lo
    // esperado, la única recuperación posible es loguearse de nuevo (una vez, no en loop).
    if (err.response?.status === 401) {
      const fresh = await login();
      return axios(withToken(fresh));
    }
    throw err;
  }
}

// --- Catálogos (cacheados en memoria, mismo TTL que mercadolibre.service.js) ---
const CATALOG_TTL = 24 * 60 * 60 * 1000;
let tiposCache = null;
let tiposCachedAt = 0;

export async function getTiposPropiedad() {
  const now = Date.now();
  if (tiposCache && now - tiposCachedAt < CATALOG_TTL) return tiposCache;
  const { data } = await zpRequest('GET', '/v1/tipopropiedades');
  tiposCache = data;
  tiposCachedAt = now;
  return tiposCache;
}

// Mapeo Property.type.name (catálogo de Tokko) -> idTipo/idSubTipo de ZonaProp. Relevado a mano
// 2026-09-02 contra el catálogo real de subtipos (ver PLAN_ZONAPROP.md §9.1) para los 5 tipos que
// existen hoy en Mongo (Casa, Terreno, Departamento, Hotel, Local) — Terrenos/Hotel/Local no tienen
// subtipos en el catálogo de ZP (array vacío), por eso no llevan idSubTipo.
const TYPE_MAP = {
  casa: { idTipo: '1', idSubTipo: '46' },
  departamento: { idTipo: '2', idSubTipo: '38' },
  terreno: { idTipo: '26' },
  hotel: { idTipo: '38' },
  local: { idTipo: '5' },
};

// Si aparece un tipo nuevo que no está en TYPE_MAP no hay que inventar un mapeo — mejor frenar el
// sync de esa propiedad puntual con un error claro que mandar un idTipo adivinado.
export function resolvePropertyType(property) {
  const name = String(property.type?.name || '').toLowerCase().trim();
  const match = TYPE_MAP[name];
  if (!match) throw new Error(`No hay mapeo de ZonaProp para el tipo de propiedad "${property.type?.name}". Agregarlo a TYPE_MAP en zonaprop.service.js.`);
  return match;
}

const ubicacionCache = new Map();

// Devuelve un array jerárquico: país (V1-A-) -> provincia/región (V1-B-) -> CIUDAD (V1-C-) -> zona
// puntual (V1-D-), confirmado en vivo 2026-09-02. El nivel correcto para `idUbicacion` es el de
// ciudad (V1-C-): usar el de zona (V1-D-) genera el warning "la latitud/longitud hace referencia
// a una Zona distinta a la dirección del aviso" (visto en un aviso real vía GET .../status).
async function resolveUbicacion(property) {
  const lat = property.geo_lat;
  const long = property.geo_long;
  if (lat == null || long == null) return null;
  const key = `${lat},${long}`;
  if (ubicacionCache.has(key)) return ubicacionCache.get(key);
  const { data } = await zpRequest('GET', `/v1/ubicaciones/latitud/${lat}/longitud/${long}/countrycode/AR`);
  const list = Array.isArray(data) ? data : [data].filter(Boolean);
  const ciudad = list.find((l) => l?.id?.startsWith('V1-C-')) || list[list.length - 1] || null;
  const result = ciudad ? { idUbicacion: ciudad.id, ubicacion: ciudad.nombreCompleto || ciudad.nombre } : null;
  ubicacionCache.set(key, result);
  return result;
}

function parseNumericField(v) {
  if (v == null || v === '') return undefined;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

// IDs de característica confirmados contra /v1/tipopropiedades/1/caracteristicas (ver PLAN_ZONAPROP.md
// §9.1) — los CFT# son un catálogo "Principales"/"Medidas" que por su nomenclatura genérica (no
// prefijado por idTipo) asumimos compartido entre tipos. Si algún tipo devuelve warnings de
// característica inválida, hay que confirmar el catálogo específico de ese idTipo antes de seguir.
function mapCaracteristicas(property) {
  const out = [];
  const push = (id, valor) => {
    if (valor === undefined || valor === null || valor === '') return;
    out.push({ id, valor: String(valor) });
  };
  push('CFT1', property.room_amount); // AMBIENTE
  push('CFT2', property.suite_amount); // DORMITORIO
  push('CFT3', property.bathroom_amount); // BANO
  push('CFT5', property.age); // ANTIGUEDAD
  push('CFT6', property.expenses); // EXPENSAS
  push('CFT7', property.parking_lot_amount); // COCHERA
  // Tokko suele dejar `total_surface` en "0.00" y guardar la superficie real de terreno en el campo
  // genérico `surface` (confirmado en vivo 2026-09-02, ej. Property.id 8501202: total_surface="0.00"
  // pero surface="450.00" — y 450 es justamente el valor que ya tenía cargado el aviso original en
  // ZonaProp). Si total_surface es 0/vacío, usar `surface` en vez de mandar 0 (dispara WARN-0215).
  const totalSurfaceRaw = parseNumericField(property.total_surface);
  const totalSurface = totalSurfaceRaw > 0 ? totalSurfaceRaw : parseNumericField(property.surface);
  const roofedSurface = parseNumericField(property.roofed_surface);
  push('CFT100', totalSurface); // MEDIDAS|SUPERFICIE_TOTAL
  push('CFT101', roofedSurface); // MEDIDAS|SUPERFICIE_CUBIERTA
  // MEDIDAS|UNIDAD_DE_MEDIDA (Select, idValor) — confirmado en vivo 2026-09-02: "M2" en mayúsculas
  // genera WARN-0101 y Navent lo corrige solo a "m2"; mandarlo ya en minúscula evita el warning.
  if (totalSurface != null || roofedSurface != null) push('CON1', 'm2');
  return out;
}

// Alquiler temporal se publica acá como ALQUILER estándar cuando tiene precio cargado (decisión
// 2026-09-09: usar créditos DESTACADO libres en propiedades de temporada que no tenían otro
// circuito de publicación armado). Distinto del criterio de ML, que sigue sin publicar temporales.
function mapPrecios(property) {
  const precios = [];
  for (const op of property.operations || []) {
    if (!op.prices?.length) continue;
    let operacion = null;
    if (/venta/i.test(op.operation_type)) operacion = 'VENTA';
    else if (/alquiler/i.test(op.operation_type)) operacion = 'ALQUILER';
    if (!operacion) continue;
    const price = op.prices[0];
    // Un precio recién cargado a mano en el CRM (ej. desde la ficha, editando solo el número sin
    // tocar el selector de moneda) se guarda sin currency — no significa que sea en pesos, el
    // selector ya lo muestra en USD por defecto. Solo se cae a ARS cuando currency vino explícito
    // y es otra moneda (lo que sí manda Tokko para operaciones en pesos).
    const moneda = (!price.currency || price.currency === 'USD') ? 'USD' : 'ARS';
    precios.push({ operacion, moneda, monto: String(price.price) });
  }
  return precios;
}

const ZP_MAX_IMAGENES = 50; // confirmado en vivo (WARN-0211): Navent trunca solo, mejor no mandar de más

function mapMultimedia(property) {
  const base = getBackendPublicUrl();
  const imagenes = (property.photos || [])
    .filter((p) => p.local_image)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(0, ZP_MAX_IMAGENES)
    .map((p) => ({
      urlImagenOriginal: p.local_image.startsWith('http') ? p.local_image : `${base}${p.local_image}`,
      titulo: '',
    }));
  // Schema confirmado contra swagger-ui-init.js de la API real (2026-09-21): videos es
  // [{ codigoVideo, titulo }], donde codigoVideo es el ID de YouTube (mismo video_id que
  // ya guarda VideoManager.js en el CRM), no la URL completa.
  const videos = (property.videos || [])
    .filter((v) => v.video_id)
    .map((v) => ({ codigoVideo: v.video_id, titulo: v.title || '' }));
  return { imagenes, planos: [], recorridos360: [], videos };
}

// Contacto del publicador — fijo por ahora (una sola cuenta/agencia), configurable por env.
function mapPublicador() {
  return {
    codigoInmobiliaria: codigoInmobiliaria(),
    nombreDeContacto: process.env.ZP_CONTACT_NAME || 'Silvia Fernández',
    emailDeContacto: process.env.ZP_CONTACT_EMAIL || process.env.LEADS_EMAIL || '',
    emailAsesor: process.env.ZP_CONTACT_EMAIL || process.env.LEADS_EMAIL || '',
    telefonoDeContacto: process.env.ZP_CONTACT_PHONE || '',
  };
}

// Arma el payload completo de un aviso a partir de una Property. `tipoDePublicacion` no se decide
// acá: para avisos existentes se preserva el plan que ya tenían (lo resuelve syncProperty antes de
// llamar a esto), para avisos nuevos se pasa por parámetro (default SIMPLE, ver syncProperty).
export async function mapPropertyToZpAviso(property, tipoDePublicacion) {
  const tipoDePropiedad = resolvePropertyType(property);
  const ubicacion = await resolveUbicacion(property);
  const precios = mapPrecios(property);
  if (!precios.length) throw new Error('La propiedad no tiene ninguna operación (venta/alquiler) vigente con precio — no se puede publicar en ZonaProp.');

  return {
    titulo: (property.publication_title || property.address || 'Propiedad').slice(0, 100),
    descripcion: property.rich_description || property.description || '',
    tipoDePropiedad,
    caracteristicas: mapCaracteristicas(property),
    precios,
    multimedia: mapMultimedia(property),
    localizacion: {
      idUbicacion: ubicacion?.idUbicacion || undefined,
      ubicacion: ubicacion?.ubicacion || property.location?.name || '',
      direccion: property.address || '',
      codigoPostal: property.location?.zip_code || '',
      latitud: property.geo_lat != null ? String(property.geo_lat) : undefined,
      longitud: property.geo_long != null ? String(property.geo_long) : undefined,
      muestraMapa: 'APROXIMADO',
    },
    publicacion: { tipoDePublicacion: tipoDePublicacion || 'SIMPLE' },
    publicador: mapPublicador(),
  };
}

// --- CRUD de avisos ---

export async function getAviso(codigoAviso) {
  const { data } = await zpRequest('GET', `/v1/inmobiliarias/${codigoInmobiliaria()}/avisos/${codigoAviso}`);
  return data;
}

export async function getAvisoStatus(codigoAviso) {
  const { data } = await zpRequest('GET', `/v1/inmobiliarias/${codigoInmobiliaria()}/avisos/${codigoAviso}/status`);
  return data;
}

export async function upsertAviso(codigoAviso, payload) {
  const { data } = await zpRequest('PUT', `/v1/inmobiliarias/${codigoInmobiliaria()}/avisos/${codigoAviso}`, { data: payload });
  return data;
}

// Pone el aviso offline — NO lo borra (no existe un DELETE físico en la API de Navent).
export async function deleteAviso(codigoAviso) {
  const { data } = await zpRequest('DELETE', `/v1/inmobiliarias/${codigoInmobiliaria()}/avisos/${codigoAviso}`);
  return data;
}

export async function getDisponibilidad() {
  const { data } = await zpRequest('GET', `/v1/inmobiliarias/${codigoInmobiliaria()}/disponibilidad`);
  return data;
}

export async function getAvisosOnlineResumenPage(page = 0, size = 100) {
  const { data } = await zpRequest('GET', `/v1/inmobiliarias/${codigoInmobiliaria()}/avisos/online/resumen`, {
    params: { 'pageable.page': page, 'pageable.size': size },
  });
  return data;
}

export async function getAllAvisosOnlineResumen() {
  let all = [];
  let page = 0;
  const size = 100;
  for (;;) {
    const data = await getAvisosOnlineResumenPage(page, size);
    all = all.concat(data.content || []);
    if (all.length >= data.total || !data.content?.length) break;
    page += 1;
  }
  return all;
}

// --- Reconciliación con avisos ya existentes (sindicados vía Tokko antes de esta integración) ---
// Ver PLAN_ZONAPROP.md §9.1: NO hace falta "asociar" nada — estos avisos ya son manejables con
// nuestras credenciales, solo hay que recordar qué codigoAviso le corresponde a cada Property.
// Idempotente: no pisa un codigoAviso ya guardado, se puede correr tantas veces como haga falta
// (por eso también sirve como job periódico de reconciliación, no solo backfill inicial).

export function parseTokkoIdFromClave(clave) {
  const m = /(\d+)$/.exec(clave || '');
  return m ? Number(m[1]) : null;
}

// ZonaProp tiene avisos duplicados preexistentes a esta integración (mismo Tokko id publicado bajo
// más de un codigoAviso — 21 casos detectados el 2026-09-08, ver PLAN_ZONAPROP.md §12): un lead
// puede llegar con el codigoAviso del duplicado "viejo", que nunca quedó guardado en la Property
// (reconcile solo guarda el primero que encuentra, es idempotente a propósito). Por eso el matching
// no puede confiar solo en `difusion.zonaprop.codigoAviso`: si el match directo falla, se resuelve
// el aviso puntual contra ZonaProp y se matchea por Tokko id (misma lógica que reconcileExistingListings).
export async function findPropertyByCodigoAviso(codigoAviso) {
  if (!codigoAviso) return null;
  const direct = await Property.findOne({ 'difusion.zonaprop.codigoAviso': codigoAviso }).lean();
  if (direct) return direct;
  try {
    const aviso = await getAviso(codigoAviso);
    const tokkoId = parseTokkoIdFromClave(aviso.claveInterna || aviso.claveReferencia);
    if (!tokkoId) return null;
    return Property.findOne({ id: tokkoId }).lean();
  } catch {
    // Aviso borrado/inaccesible del lado de ZonaProp — no hay forma de resolverlo, no es un error.
    return null;
  }
}

export async function reconcileExistingListings() {
  const avisos = await getAllAvisosOnlineResumen();
  let linked = 0;
  let alreadyLinked = 0;
  const unmatched = [];

  for (const aviso of avisos) {
    const clave = aviso.claveInterna || aviso.claveReferencia;
    const tokkoId = parseTokkoIdFromClave(clave);
    if (!tokkoId) {
      unmatched.push({ codigoAviso: aviso.codigoAviso, titulo: aviso.titulo, reason: 'sin-clave-interna' });
      continue;
    }
    const property = await Property.findOne({ id: tokkoId }, { id: 1, 'difusion.zonaprop': 1 }).lean();
    if (!property) {
      unmatched.push({ codigoAviso: aviso.codigoAviso, tokkoId, titulo: aviso.titulo, reason: 'no-existe-en-mongo' });
      continue;
    }
    if (property.difusion?.zonaprop?.codigoAviso) {
      alreadyLinked += 1;
      // Backfill de campos agregados después de que esta propiedad ya se había vinculado (ej. `url`,
      // sumado 2026-09-07) — se completa con datos que YA tenemos guardados (idAvisoNavplat), sin
      // llamar a la API de ZonaProp: cero riesgo, no es un PUT ni consume nada.
      if (!property.difusion.zonaprop.url && property.difusion.zonaprop.idAvisoNavplat) {
        await Property.updateOne(
          { id: tokkoId },
          { $set: { 'difusion.zonaprop.url': buildAvisoUrl(property.difusion.zonaprop.idAvisoNavplat) } }
        );
      }
      continue;
    }
    await Property.updateOne(
      { id: tokkoId },
      {
        $set: {
          'difusion.zonaprop.codigoAviso': aviso.codigoAviso,
          'difusion.zonaprop.idAvisoNavplat': aviso.idAvisoNavplat,
          'difusion.zonaprop.url': buildAvisoUrl(aviso.idAvisoNavplat),
          'difusion.zonaprop.published': true,
          'difusion.zonaprop.tipoDePublicacion': aviso.tipoDePublicacion || aviso.publicacion,
          'difusion.zonaprop.updated_at': new Date(),
        },
      }
    );
    linked += 1;
  }

  return { total: avisos.length, linked, alreadyLinked, unmatched };
}

// --- Sync orquestador (mismo criterio que mercadolibre.service.js syncProperty) ---
// A diferencia de ML, acá es UN aviso por propiedad (no uno por operación): `precios` es un array
// que puede llevar venta Y alquiler a la vez dentro del mismo aviso.

const ZP_ELIGIBLE_STATUSES = ['disponible', 'reservada'];

function extractZpMessages(list) {
  return (list || []).map((m) => ({ code: m.messageCode, message: m.messageText }));
}

async function saveZpState(propertyId, patch) {
  await Property.updateOne(
    { id: propertyId },
    { $set: { ...patch, 'difusion.zonaprop.updated_at': new Date() } }
  );
}

export async function syncProperty(propertyDoc, { forcePlan } = {}) {
  const existing = propertyDoc.difusion?.zonaprop || {};
  const eligible = ZP_ELIGIBLE_STATUSES.includes(propertyDoc.status);
  const codigoAviso = existing.codigoAviso || String(propertyDoc.id);

  if (!eligible) {
    if (existing.published) {
      try {
        await deleteAviso(codigoAviso);
      } catch (err) {
        // Si Navent ya no lo tiene (404) no es un error real, ya está "offline" de hecho.
        if (err.response?.status !== 404) throw err;
      }
    }
    await saveZpState(propertyDoc.id, {
      'difusion.zonaprop.codigoAviso': codigoAviso,
      'difusion.zonaprop.published': false,
      'difusion.zonaprop.last_error': null,
    });
    return { published: false };
  }

  // Para avisos que ya existían (reconciliados) preservamos el plan que ya tenían pagado —
  // no lo pisamos con un default, evita bajar un DESTACADO a SIMPLE por error. `forcePlan` es el
  // cambio explícito del usuario (selector de plan en la UI, ver updatePlan más abajo).
  const tipoDePublicacion = forcePlan || existing.tipoDePublicacion || 'SIMPLE';

  try {
    const payload = await mapPropertyToZpAviso(propertyDoc, tipoDePublicacion);
    const result = await upsertAviso(codigoAviso, payload);
    const errors = extractZpMessages(result.errors);
    const warnings = extractZpMessages(result.warnings);
    const idAvisoNavplat = result.idAviso || existing.idAvisoNavplat;
    await saveZpState(propertyDoc.id, {
      'difusion.zonaprop.codigoAviso': codigoAviso,
      'difusion.zonaprop.idAvisoNavplat': idAvisoNavplat,
      'difusion.zonaprop.url': buildAvisoUrl(idAvisoNavplat),
      'difusion.zonaprop.published': errors.length === 0,
      'difusion.zonaprop.estado': result.estado,
      'difusion.zonaprop.tipoDePublicacion': tipoDePublicacion,
      'difusion.zonaprop.errors': errors,
      'difusion.zonaprop.warnings': warnings,
      'difusion.zonaprop.last_error': errors[0]?.message || null,
    });
    if (errors.length) throw new Error(errors.map((e) => `${e.code}: ${e.message}`).join(' | '));
    return { published: true, errors, warnings };
  } catch (err) {
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    await saveZpState(propertyDoc.id, {
      'difusion.zonaprop.codigoAviso': codigoAviso,
      'difusion.zonaprop.last_error': message,
    });
    throw new Error(message);
  }
}

// Sync masivo con throttling — mismo patrón que mercadolibre.service.js syncAllProperties.
export async function syncAllProperties({ delayMs = 1500 } = {}) {
  const properties = await Property.find({}).lean();
  const results = { total: properties.length, ok: 0, failed: 0, errors: [] };
  for (const property of properties) {
    try {
      await syncProperty(property);
      results.ok += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ id: property.id, error: err.message });
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return results;
}

const ZP_PLANS = ['SIMPLE', 'DESTACADO', 'HOME'];

// Cambia el plan de publicación de un aviso ya existente (Simple/Destacado/Home) — selector de
// plan en la UI, mismo criterio que upgradeListingType de MercadoLibre. Consume un crédito del
// plan elegido en ZonaProp; si no hay disponible, el PUT falla con ERR-0502 y syncProperty ya
// guarda ese error en difusion.zonaprop.last_error — no hace falta chequear crédito antes acá.
export async function updatePlan(propertyId, tipoDePublicacion) {
  if (!ZP_PLANS.includes(tipoDePublicacion)) {
    throw new Error(`Plan de ZonaProp inválido: "${tipoDePublicacion}". Válidos: ${ZP_PLANS.join(', ')}`);
  }
  const property = await Property.findOne({ id: propertyId }).lean();
  if (!property) throw new Error('Propiedad no encontrada');
  await syncProperty(property, { forcePlan: tipoDePublicacion });
  const updated = await Property.findOne({ id: propertyId }, { difusion: 1 }).lean();
  return updated.difusion?.zonaprop || {};
}

// --- Configuración de callbacks (webhook de leads/estado/calidad/créditos) ---
// Requiere que BACKEND_PUBLIC_URL apunte a una URL pública real (el VPS) — no tiene sentido
// correr esto en local, Navent no puede pegarle a localhost. No se llama automáticamente en
// ningún arranque: es una acción explícita (ver zonaprop.controller.js configureZonapropCallbacks).
const ZP_CALLBACK_EVENTS = ['CONTACTO', 'CONTACTO_MENSAJE', 'AVISO_ESTADO_PUBLICACION', 'AVISO_CALIDAD', 'CREDITO'];

export async function configureCallbacks() {
  const base = getBackendPublicUrl();
  const url = `${base}/api/zonaprop/webhook/callback`;
  await zpRequest('PUT', '/v1/configuracion/callbacks', {
    data: {
      url,
      authorizationHeaderKey: 'Authorization',
      authorizationHeaderValue: `Bearer ${process.env.ZP_CALLBACK_AUTH_TOKEN}`,
      lenguajeCallbackBody: 'ES',
    },
  });
  for (const evento of ZP_CALLBACK_EVENTS) {
    await zpRequest('PUT', `/v1/configuracion/callbacks/${evento}`);
  }
  return { url, subscribed: ZP_CALLBACK_EVENTS };
}

export async function getCallbacksConfig() {
  const { data } = await zpRequest('GET', '/v1/configuracion/callbacks');
  return data;
}

// --- Contactos/leads por consulta (fallback a Callbacks, que la cuenta actual — plan "API Free",
// confirmado 2026-09-03 vía Sofía/Navent — no incluye). Este endpoint SÍ está disponible en Free:
// probado en vivo contra producción y trajo contactos reales. `fromDate` en formato yyyyMMdd.
export async function getMensajesPage(fromDate, page = 0, size = 100) {
  const { data } = await zpRequest('GET', `/v2/inmobiliarias/${codigoInmobiliaria()}/mensajes`, {
    params: { fromDate, 'pageable.page': page, 'pageable.size': size },
  });
  return data;
}

export async function getAllMensajes(fromDate) {
  let all = [];
  let page = 0;
  const size = 100;
  for (;;) {
    const data = await getMensajesPage(fromDate, page, size);
    all = all.concat(data.content || []);
    if (all.length >= data.total || !data.content?.length) break;
    page += 1;
  }
  return all;
}
