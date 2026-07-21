import crypto from 'crypto';
import Property from '../models/Property.model.js';
import Lead from '../models/Lead.model.js';
import Activity from '../models/Activity.model.js';
import * as ml from '../utils/mercadolibre.service.js';

// Estado OAuth en memoria (backend corre en una sola instancia): protege el callback de CSRF
const oauthStates = new Map();
const OAUTH_STATE_TTL = 5 * 60 * 1000;

export function connectMercadoLibre(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now() + OAUTH_STATE_TTL);
  res.redirect(ml.buildAuthUrl(state));
}

export async function oauthCallback(req, res) {
  const { code, state } = req.query;
  const validUntil = oauthStates.get(state);
  if (!validUntil || validUntil < Date.now()) {
    return res.status(400).send('Estado inválido o expirado. Reintentá la conexión desde el CRM.');
  }
  oauthStates.delete(state);
  try {
    await ml.exchangeCodeForToken(code);
    res.send('Cuenta de MercadoLibre conectada correctamente. Ya podés cerrar esta ventana.');
  } catch (err) {
    res.status(500).send(`Error conectando con MercadoLibre: ${JSON.stringify(err.response?.data || err.message)}`);
  }
}

export async function syncToMercadoLibre(req, res) {
  const { propertyId } = req.params;
  try {
    const property = await Property.findOne({ id: parseInt(propertyId, 10) }).lean();
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });
    const result = await ml.syncProperty(property);
    await Activity.create({
      type: 'ml_sync',
      description: `Propiedad ${property.id} sincronizada con MercadoLibre`,
      userId: req.user?.id,
      userName: req.user?.name,
      entityId: String(property.id),
      entityType: 'property',
    });
    const updated = await Property.findOne({ id: property.id }, { difusion: 1 }).lean();
    res.json({ ok: true, listings: updated.difusion?.mercadolibre?.listings || [], ...result });
  } catch (err) {
    res.status(502).json({ message: 'Error sincronizando con MercadoLibre', detail: err.message });
  }
}

export async function syncAllMercadoLibre(req, res) {
  res.json({ started: true });
  try {
    const summary = await ml.syncAllProperties();
    await Activity.create({
      type: 'ml_sync_completed',
      description: `Sync masivo con MercadoLibre: ${summary.ok} ok, ${summary.failed} con error (de ${summary.total})`,
      userId: req.user?.id,
      userName: req.user?.name,
      meta: summary,
    });
  } catch (err) {
    console.error('Error en sync masivo de MercadoLibre', err.message);
  }
}

export async function getMercadoLibreStatus(req, res) {
  try {
    const [connected, published, pending, withError] = await Promise.all([
      ml.isConnected(),
      Property.countDocuments({ 'difusion.mercadolibre.published': true }),
      Property.countDocuments({ 'difusion.mercadolibre.published': { $ne: true }, status: 'disponible' }),
      Property.countDocuments({ 'difusion.mercadolibre.last_error': { $ne: null } }),
    ]);
    res.json({ connected, published, pending, withError });
  } catch (err) {
    res.status(500).json({ message: 'Error obteniendo estado de MercadoLibre', detail: err.message });
  }
}

export async function handleMercadoLibreLead(req, res) {
  // ML exige una respuesta rápida (< 500ms): confirmamos la recepción y procesamos después
  res.sendStatus(200);
  const { resource } = req.body || {};
  if (!resource) return;
  try {
    const data = await ml.fetchNotificationResource(resource);
    // TODO: confirmar la forma exacta del payload de leads de Inmuebles contra la respuesta real de ML
    const name = data.name || data.contact?.name || 'Contacto MercadoLibre';
    const email = data.email || data.contact?.email || '';
    const phone = data.phone || data.contact?.phone || '';
    const itemId = data.item_id || data.resource_id;

    let propertyId;
    let propertyTitle = '';
    if (itemId) {
      const prop = await Property.findOne({ 'difusion.mercadolibre.listings.item_id': String(itemId) }).lean();
      if (prop) {
        propertyId = prop.id;
        propertyTitle = prop.publication_title || prop.address || '';
      }
    }

    const lead = await Lead.create({
      name,
      email,
      phone,
      propertyId,
      propertyTitle,
      source: 'mercadolibre',
      message: data.message || '',
    });

    await Activity.create({
      type: 'lead_created',
      description: `Nuevo lead de MercadoLibre: ${name}${propertyTitle ? ` — ${propertyTitle}` : ''}`,
    });
    return lead;
  } catch (err) {
    console.error('Error procesando lead de MercadoLibre', err.response?.data || err.message);
  }
}
