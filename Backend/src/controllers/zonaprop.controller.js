import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';
import Lead from '../models/Lead.model.js';
import * as zp from '../utils/zonaprop.service.js';
import { sendLeadEmail } from '../utils/email.util.js';

// Mismo universo "publicable" que MercadoLibre (ver mercadolibre.controller.js).
const ZP_ELIGIBLE_STATUSES = ['disponible', 'reservada'];

export async function getZonaPropSummary(req, res) {
  try {
    const [propertiesTotal, propertiesPublicadas, planCounts, errores] = await Promise.all([
      Property.countDocuments({ status: { $in: ZP_ELIGIBLE_STATUSES } }),
      Property.countDocuments({ status: { $in: ZP_ELIGIBLE_STATUSES }, 'difusion.zonaprop.published': true }),
      Property.aggregate([
        { $match: { status: { $in: ZP_ELIGIBLE_STATUSES }, 'difusion.zonaprop.published': true } },
        { $group: { _id: '$difusion.zonaprop.tipoDePublicacion', count: { $sum: 1 } } },
      ]),
      Property.countDocuments({ 'difusion.zonaprop.last_error': { $nin: [null, ''] } }),
    ]);

    const por_plan = { SIMPLE: 0, DESTACADO: 0, HOME: 0 };
    for (const p of planCounts) {
      const key = String(p._id || '').replace('_COMBO_ZONA_DEMAND', '');
      if (por_plan[key] != null) por_plan[key] += p.count;
    }

    // Créditos disponibles/por vencer: viven en ZonaProp, no en Mongo — si el sandbox está caído o
    // fuera de horario (Lu-Vi 07:00-20:55 ART) no tiene que romper el resto del resumen.
    let creditos = null;
    try {
      creditos = await zp.getDisponibilidad();
    } catch (err) {
      creditos = null;
    }

    res.json({
      propiedades_publicadas: propertiesPublicadas,
      propiedades_sin_publicar: propertiesTotal - propertiesPublicadas,
      publicaciones_simples: por_plan.SIMPLE,
      publicaciones_destacadas: por_plan.DESTACADO,
      publicaciones_home: por_plan.HOME,
      errores,
      creditos, // { disponibles: [{planDePublicacion, cantidadDisponible}], vencimientos: [{planDePublicacion, cantidad, fecha}] } o null si no se pudo consultar
    });
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo resumen de ZonaProp', detail: err.message });
  }
}

const FILTER_PLAN = { simples: 'SIMPLE', destacadas: 'DESTACADO', home: 'HOME' };

// Detalle por propiedad para cada tile de la card de Difusión — mismo criterio que MercadoLibre.
export async function getZonaPropSummaryProperties(req, res) {
  const { filter } = req.query;
  if (!['simples', 'destacadas', 'home', 'errores'].includes(filter)) {
    return res.status(400).json({ message: 'Filtro inválido. Usá simples, destacadas, home o errores.' });
  }
  try {
    const query = { status: { $in: ZP_ELIGIBLE_STATUSES } };
    if (filter === 'errores') {
      query['difusion.zonaprop.last_error'] = { $nin: [null, ''] };
    } else {
      query['difusion.zonaprop.published'] = true;
      // _COMBO_ZONA_DEMAND es una variante del mismo plan — matchea con o sin el sufijo.
      query['difusion.zonaprop.tipoDePublicacion'] = new RegExp(`^${FILTER_PLAN[filter]}`);
    }
    const properties = await Property.find(query, {
      id: 1, address: 1, publication_title: 1, reference_code: 1,
      type: 1, 'location.name': 1, photos: { $slice: 1 }, difusion: 1,
    }).lean();

    const rows = properties.map((p) => ({
      propertyId: p.id,
      reference_code: p.reference_code || '',
      address: p.address || '',
      publication_title: p.publication_title || '',
      type_name: p.type?.name || '',
      location_name: p.location?.name || '',
      photo: p.photos?.[0] ? { local_image: p.photos[0].local_image, image_url: p.photos[0].image_url, thumb_url: p.photos[0].thumb_url } : null,
      tipoDePublicacion: p.difusion?.zonaprop?.tipoDePublicacion || '',
      estado: p.difusion?.zonaprop?.estado || '',
      calidad_percentage: p.difusion?.zonaprop?.calidad_percentage ?? null,
      last_error: p.difusion?.zonaprop?.last_error || '',
      warnings: p.difusion?.zonaprop?.warnings || [],
    }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo el detalle de ZonaProp', detail: err.message });
  }
}

export async function syncToZonaprop(req, res) {
  const { propertyId } = req.params;
  try {
    const property = await Property.findOne({ id: parseInt(propertyId, 10) }).lean();
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });
    const result = await zp.syncProperty(property);
    await Activity.create({
      type: 'zp_sync',
      description: `Propiedad ${property.id} sincronizada con ZonaProp`,
      userId: req.user?.id,
      userName: req.user?.name,
      entityId: String(property.id),
      entityType: 'property',
    });
    const updated = await Property.findOne({ id: property.id }, { difusion: 1 }).lean();
    res.json({ ok: true, zonaprop: updated.difusion?.zonaprop || {}, ...result });
  } catch (err) {
    res.status(502).json({ message: 'Error sincronizando con ZonaProp', detail: err.message });
  }
}

export async function syncAllZonaprop(req, res) {
  res.json({ started: true });
  try {
    const summary = await zp.syncAllProperties();
    await Activity.create({
      type: 'zp_sync_completed',
      description: `Sync masivo con ZonaProp: ${summary.ok} ok, ${summary.failed} con error (de ${summary.total})`,
      userId: req.user?.id,
      userName: req.user?.name,
      meta: summary,
    });
  } catch (err) {
    console.error('Error en sync masivo de ZonaProp', err.message);
  }
}

// Backfill/reconciliación de avisos que ya existían antes de esta integración (ver PLAN_ZONAPROP.md
// §9.1) — idempotente, se puede correr las veces que haga falta. Fire-and-forget (mismo patrón que
// sync-all): son ~190 consultas secuenciales a Mongo + llamadas a ZonaProp, y en producción (más
// latencia real a Mongo/Navent que en local) puede superar el proxy_read_timeout de Nginx (60s) y
// tirar un 502 aunque el proceso siga bien — confirmado 2026-09-02 contra el VPS real.
export async function reconcileZonaprop(req, res) {
  res.json({ started: true });
  try {
    const summary = await zp.reconcileExistingListings();
    await Activity.create({
      type: 'zp_reconciled',
      description: `Reconciliación de ZonaProp: ${summary.linked} vinculados, ${summary.alreadyLinked} ya vinculados, ${summary.unmatched.length} sin match (de ${summary.total})`,
      userId: req.user?.id,
      userName: req.user?.name,
      meta: summary,
    });
  } catch (err) {
    console.error('Error en la reconciliación de ZonaProp', err.message);
    await Activity.create({
      type: 'zp_reconciled',
      description: `Reconciliación de ZonaProp falló: ${err.message}`,
      userId: req.user?.id,
      userName: req.user?.name,
    }).catch(() => {});
  }
}

// Configura la URL de callbacks + suscripciones en Navent. Requiere BACKEND_PUBLIC_URL apuntando
// a una URL pública real — no tiene sentido correrlo en local. Acción manual, no automática.
export async function configureZonapropCallbacks(req, res) {
  try {
    const result = await zp.configureCallbacks();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(502).json({ message: 'Error configurando callbacks de ZonaProp', detail: err.message });
  }
}

export async function getZonapropCallbacksConfig(req, res) {
  try {
    const config = await zp.getCallbacksConfig();
    res.json(config);
  } catch (err) {
    res.status(502).json({ message: 'Error obteniendo configuración de callbacks de ZonaProp', detail: err.message });
  }
}

function tokkoIdFromClaveInterna(clave) {
  const m = /(\d+)$/.exec(clave || '');
  return m ? Number(m[1]) : null;
}

async function findPropertyByCallbackBody(body) {
  // El nombre exacto del campo con nuestro codigoAviso varía según la variante de idioma que
  // devuelve la doc scrapeada (Notion) — probamos las alternativas documentadas en vez de
  // confiar en una sola. Confirmar contra el primer evento real capturado (queda logueado abajo).
  const codigoAviso = body.codigoAviso || body.referencia || body.code;
  if (codigoAviso) {
    const byCode = await Property.findOne({ 'difusion.zonaprop.codigoAviso': codigoAviso }).lean();
    if (byCode) return byCode;
  }
  const claveInterna = body.claveInterna || body.internalReference;
  const tokkoId = tokkoIdFromClaveInterna(claveInterna);
  if (tokkoId) return Property.findOne({ id: tokkoId }).lean();
  return null;
}

async function handleZonapropContactEvent(body) {
  const property = await findPropertyByCallbackBody(body);
  const name = body.nombre || body.name || 'Contacto ZonaProp';
  const email = body.email || '';
  const phone = body.telefono || body.phone || '';
  const message = body.mensaje || body.message || '';

  const lead = await Lead.create({
    name,
    email,
    phone,
    propertyId: property?.id,
    propertyTitle: property ? (property.publication_title || property.address || '') : '',
    source: 'zonaprop',
    message,
  });

  sendLeadEmail(lead, property).catch(console.error);

  await Activity.create({
    type: 'lead_created',
    description: `Nuevo lead de ZonaProp: ${name}${property ? ` — ${property.publication_title || property.address}` : ''}`,
  });
}

async function handleZonapropAvisoEstado(body) {
  const codigoAviso = body.codigoAviso || body.code;
  if (!codigoAviso) return;
  try {
    const status = await zp.getAvisoStatus(codigoAviso);
    await Property.updateOne(
      { 'difusion.zonaprop.codigoAviso': codigoAviso },
      {
        $set: {
          'difusion.zonaprop.estado': status.estado,
          'difusion.zonaprop.published': status.estado === 'PROCESADO' && !status.fechaOffline,
          'difusion.zonaprop.updated_at': new Date(),
        },
      }
    );
  } catch (err) {
    console.error('No se pudo refrescar el status del aviso de ZonaProp', codigoAviso, err.message);
  }
}

async function handleZonapropAvisoCalidad(body) {
  const codigoAviso = body.codigoAviso || body.code;
  if (!codigoAviso) return;
  const pct = body.porcentajeCalidad ?? body.qualityPercentage;
  await Property.updateOne(
    { 'difusion.zonaprop.codigoAviso': codigoAviso },
    {
      $set: {
        'difusion.zonaprop.calidad_percentage': pct != null ? Math.round(pct) : null,
        'difusion.zonaprop.updated_at': new Date(),
      },
    }
  );
}

// Webhook público — Navent exige respuesta en menos de 1.5s (si no, lo interpreta como timeout y
// reintenta hasta 72hs), así que confirmamos la recepción YA y procesamos después, mismo criterio
// que el webhook de leads de MercadoLibre.
export async function handleZonapropCallback(req, res) {
  res.sendStatus(200);

  if (process.env.ZP_CALLBACK_AUTH_TOKEN) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.ZP_CALLBACK_AUTH_TOKEN}`) {
      console.error('Callback de ZonaProp con Authorization inválido, ignorado');
      return;
    }
  }

  const body = req.body || {};
  const tipoEvento = body.tipoEvento || body.eventType;
  try {
    switch (tipoEvento) {
      case 'CONTACTO':
      case 'CONTACTO_MENSAJE':
        await handleZonapropContactEvent(body);
        break;
      case 'AVISO_ESTADO_PUBLICACION':
        await handleZonapropAvisoEstado(body);
        break;
      case 'AVISO_CALIDAD':
        await handleZonapropAvisoCalidad(body);
        break;
      case 'CREDITO':
        await Activity.create({
          type: 'zp_sync',
          description: `ZonaProp: crédito ${body.planDePublicacion || body.publicationPlan || ''} — ${body.accion || body.action || ''} (${body.status || ''})`,
        });
        break;
      default:
        console.log('Evento de callback de ZonaProp no reconocido:', tipoEvento, JSON.stringify(body));
    }
  } catch (err) {
    console.error('Error procesando callback de ZonaProp', err.message, JSON.stringify(body));
  }
}
