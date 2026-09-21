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
      url: p.difusion?.zonaprop?.url || '',
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

export async function upgradeZonapropPlan(req, res) {
  const { propertyId } = req.params;
  const { tipoDePublicacion } = req.body || {};
  if (!tipoDePublicacion) return res.status(400).json({ message: 'Falta tipoDePublicacion' });
  try {
    const zonaprop = await zp.updatePlan(parseInt(propertyId, 10), tipoDePublicacion);
    await Activity.create({
      type: 'zp_sync',
      description: `Propiedad ${propertyId}: cambio de plan de ZonaProp a ${tipoDePublicacion}`,
      userId: req.user?.id,
      userName: req.user?.name,
      entityId: propertyId,
      entityType: 'property',
    });
    res.json({ ok: true, zonaprop });
  } catch (err) {
    res.status(502).json({ message: 'Error cambiando el plan de ZonaProp', detail: err.message });
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
    // Confirmado 2026-09-03: la cuenta actual es plan "API Free" de Navent, que no incluye
    // Callbacks (ni Calidad de aviso) — devuelve este 500 genérico. Hace falta pedir upgrade a
    // "Rol Premium" para tener esto. No es un bug, es una limitación del plan contratado.
    if (err.response?.data?.message === 'Access is denied') {
      return res.status(422).json({
        message: 'Tu plan actual de ZonaProp ("API Free") no incluye Callbacks. Los leads se obtienen igual por consulta periódica (ver "Sincronizar leads"). Para tener callbacks en tiempo real hay que pedirle a Navent el upgrade a "Rol Premium".',
      });
    }
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
    const byCode = await zp.findPropertyByCodigoAviso(codigoAviso);
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

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

// Fallback a Callbacks (ver nota en configureZonapropCallbacks): la cuenta actual no recibe eventos
// en tiempo real, así que los leads se traen por consulta periódica a /v2/.../mensajes. `sinceDays`
// chico (cron incremental, notifica por mail) o grande (backfill manual de contactos históricos).
// `notify` en false a propósito para backfills grandes — son contactos viejos, no leads "nuevos":
// mandar un mail de "nuevo lead" por cada uno de golpe sería spam sobre algo que ya pasó.
export async function pollZonapropLeads({ sinceDays = 2, notify = true, userId, userName } = {}) {
  const fromDate = yyyymmdd(new Date(Date.now() - sinceDays * 86400000));
  const mensajes = await zp.getAllMensajes(fromDate);

  let created = 0;
  let skipped = 0;
  for (const m of mensajes) {
    const externalId = `zp-${m.id}`;
    const exists = await Lead.exists({ externalId });
    if (exists) { skipped += 1; continue; }

    const property = await zp.findPropertyByCodigoAviso(m.codigoAviso);

    const lead = await Lead.create({
      externalId,
      name: m.nombre || 'Contacto ZonaProp',
      email: m.email || '',
      phone: m.telefono || '',
      propertyId: property?.id,
      propertyTitle: property ? (property.publication_title || property.address || '') : '',
      source: 'zonaprop',
      message: m.textoMensaje || '',
    });

    if (notify) {
      sendLeadEmail(lead, property).catch(console.error);
      // Delay chico entre mails para no ráfagar el SMTP si hay varios leads nuevos juntos.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    await Activity.create({
      type: 'lead_created',
      description: `Nuevo lead de ZonaProp: ${lead.name}${property ? ` — ${property.publication_title || property.address}` : ''}`,
    });
    created += 1;
  }

  const summary = { total: mensajes.length, created, skipped, fromDate, notified: notify };
  await Activity.create({
    type: 'zp_sync',
    description: `Polling de leads de ZonaProp: ${created} nuevos, ${skipped} ya existentes (de ${mensajes.length} contactos desde ${fromDate})${notify ? '' : ' — backfill, sin mails'}`,
    userId,
    userName,
    meta: summary,
  });
  return summary;
}

// Fire-and-forget (mismo criterio que sync-all/reconcile): un backfill grande puede tardar minutos
// y superar el timeout de Nginx. `notify` es explícito y por defecto SOLO manda mail para ventanas
// cortas (<=3 días, el caso del cron incremental) — un backfill histórico nunca manda mail salvo
// que se pida express con `?notify=true`.
export async function pollZonapropLeadsHandler(req, res) {
  res.json({ started: true });
  const sinceDays = Math.min(parseInt(req.query.sinceDays, 10) || 2, 365);
  const notify = req.query.notify != null ? req.query.notify === 'true' : sinceDays <= 3;
  try {
    await pollZonapropLeads({ sinceDays, notify, userId: req.user?.id, userName: req.user?.name });
  } catch (err) {
    console.error('Error en el polling de leads de ZonaProp', err.message);
  }
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

// Reporte de leads de ZonaProp para la sección Reportes. A diferencia de MercadoLibre, Navent no
// expone visitas/contactos por aviso en el plan actual ("API Free", ver configureZonapropCallbacks)
// — el único dato real que tenemos es el lead en sí (por callback o por polling), así que el
// reporte muestra sólo eso en vez de simular métricas que no existen.
export async function getZonaPropReports(req, res) {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 150);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - days);

    const leads = await Lead.find(
      { source: 'zonaprop', createdAt: { $gte: since } },
      { propertyId: 1, propertyTitle: 1, createdAt: 1 }
    ).lean();

    const byDate = new Map();
    const byProperty = new Map();
    for (const l of leads) {
      const dateKey = isoDay(l.createdAt);
      byDate.set(dateKey, (byDate.get(dateKey) || 0) + 1);
      if (l.propertyId) {
        const p = byProperty.get(l.propertyId) || { propertyId: l.propertyId, propertyTitle: l.propertyTitle || '', leads: 0 };
        p.leads += 1;
        byProperty.set(l.propertyId, p);
      }
    }

    const series = [...byDate.entries()].map(([date, leads]) => ({ date, leads })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const topByLeads = [...byProperty.values()].sort((a, b) => b.leads - a.leads).slice(0, 10)
      .map((p) => ({ propertyId: p.propertyId, publication_title: p.propertyTitle, address: '', leads: p.leads }));

    res.json({
      range: { from: isoDay(since), to: isoDay(new Date()), days },
      totals: { leads: leads.length },
      series,
      topByLeads,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo el reporte de ZonaProp', detail: err.message });
  }
}
