import Property from '../models/Property.model.js';
import MlToken from '../models/MlToken.model.js';
import MlMetricSnapshot from '../models/MlMetricSnapshot.model.js';
import { mlRequest } from './mercadolibre.service.js';

// Doc confirmada (2026-07-21, pegada por el usuario desde developers.mercadolibre.com.ar):
// visitas y preguntas NO tienen /time_window a nivel item, solo un total por rango — por eso
// el CRM arma su propia serie diaria acumulando un snapshot por día en MlMetricSnapshot.
// Teléfono y WhatsApp sí tienen /time_window a nivel item y soportan varios ids a la vez.

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function yesterdayRange() {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  return { date: start, date_from: isoDate(start), date_to: isoDate(start) };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getMlUserId() {
  const token = await MlToken.findOne({}).lean();
  if (!token?.ml_user_id) throw new Error('No hay cuenta de MercadoLibre conectada (falta ml_user_id)');
  return token.ml_user_id;
}

async function getItemVisits(itemId, dateFrom, dateTo) {
  const { data } = await mlRequest('get', `/items/visits?ids=${itemId}&date_from=${dateFrom}&date_to=${dateTo}`);
  return data.total_visits || 0;
}

async function getItemQuestions(itemId, dateFrom, dateTo) {
  const { data } = await mlRequest('get', `/items/${itemId}/contacts/questions?date_from=${dateFrom}&date_to=${dateTo}`);
  return data.total || 0;
}

// phone_views/whatsapp: batch de varios ids en una sola llamada, mucho más barato que uno por uno
async function getBatchTimeWindow(kind, itemIds) {
  if (!itemIds.length) return {};
  const { data } = await mlRequest('get', `/items/contacts/${kind}/time_window?ids=${itemIds.join(',')}&last=1&unit=day`);
  const arr = Array.isArray(data) ? data : [data];
  const byItem = {};
  for (const entry of arr) byItem[entry.item_id] = entry.total || 0;
  return byItem;
}

async function getLeadsForDay(dateFrom, dateTo) {
  const userId = await getMlUserId();
  const leadsByItem = {};
  const limit = 50;
  let offset = 0;
  function addLead(itemId, contactType) {
    const bucket = leadsByItem[itemId] || (leadsByItem[itemId] = {
      whatsapp: 0, question: 0, call: 0, schedule: 0, quotation: 0,
    });
    if (bucket[contactType] != null) bucket[contactType] += 1;
  }

  for (;;) {
    // Params confirmados en la doc real de Leads: date_from/date_to (snake_case), no dateFrom/dateTo.
    // include_guest=true suma también los leads de usuarios no logueados (nodo "guest", no paginado).
    const { data } = await mlRequest(
      'get',
      `/vis/users/${userId}/leads/buyers?date_from=${dateFrom}&date_to=${dateTo}&offset=${offset}&limit=${limit}&include_guest=true`
    );
    for (const buyer of data.results || []) {
      for (const lead of buyer.leads || []) addLead(buyer.item_id, lead.contact_type);
    }
    if (offset === 0) {
      for (const guestItem of data.guest || []) {
        for (const lead of guestItem.leads || []) addLead(guestItem.item_id, lead.contact_type);
      }
    }
    offset += limit;
    if (!data.paging || offset >= data.paging.total) break;
  }
  return leadsByItem;
}

function activeListingsFromProperties(properties) {
  const listings = [];
  for (const p of properties) {
    for (const l of p.difusion?.mercadolibre?.listings || []) {
      if (l.item_id && l.status !== 'closed') {
        listings.push({ propertyId: p.id, operationType: l.operation_type, itemId: l.item_id });
      }
    }
  }
  return listings;
}

// Corrida diaria (pensada para node-cron): trae las métricas del día anterior para cada
// publicación activa y guarda un snapshot. No frena si un endpoint puntual falla — guarda 0/null
// para ese dato y sigue con el resto.
export async function collectDailyMetrics({ delayMs = 400 } = {}) {
  const { date, date_from, date_to } = yesterdayRange();
  const properties = await Property.find(
    { 'difusion.mercadolibre.listings.item_id': { $exists: true } },
    { id: 1, 'difusion.mercadolibre.listings': 1 }
  ).lean();
  const activeListings = activeListingsFromProperties(properties);

  const visitsByItem = {};
  const questionsByItem = {};
  for (const { itemId } of activeListings) {
    try { visitsByItem[itemId] = await getItemVisits(itemId, date_from, date_to); } catch { visitsByItem[itemId] = 0; }
    try { questionsByItem[itemId] = await getItemQuestions(itemId, date_from, date_to); } catch { questionsByItem[itemId] = 0; }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const itemIds = activeListings.map((l) => l.itemId);
  const phoneByItem = {};
  const whatsappByItem = {};
  for (const group of chunk(itemIds, 20)) {
    try { Object.assign(phoneByItem, await getBatchTimeWindow('phone_views', group)); }
    catch (err) { console.error('Error trayendo phone_views en batch', err.message); }
    try { Object.assign(whatsappByItem, await getBatchTimeWindow('whatsapp', group)); }
    catch (err) { console.error('Error trayendo whatsapp en batch', err.message); }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  let leadsByItem = {};
  try { leadsByItem = await getLeadsForDay(date_from, date_to); }
  catch (err) { console.error('Error trayendo leads del día', err.message); }

  let saved = 0;
  for (const { propertyId, operationType, itemId } of activeListings) {
    await MlMetricSnapshot.findOneAndUpdate(
      { itemId, date },
      {
        propertyId,
        operationType,
        itemId,
        date,
        visits: visitsByItem[itemId] || 0,
        questions: questionsByItem[itemId] || 0,
        phoneViews: phoneByItem[itemId] || 0,
        whatsapp: whatsappByItem[itemId] || 0,
        leadsByType: leadsByItem[itemId] || { whatsapp: 0, question: 0, call: 0, schedule: 0, quotation: 0 },
      },
      { upsert: true }
    );
    saved += 1;
  }
  return { date: date_from, itemsProcessed: activeListings.length, saved };
}

// Serie diaria + totales de una propiedad (suma venta+alquiler si tiene los dos avisos activos —
// al que edita la ficha le importa "la propiedad", no cada aviso de ML por separado)
export async function getPropertyMetricsSeries(propertyId, days = 30) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - days);
  const snapshots = await MlMetricSnapshot.find({ propertyId, date: { $gte: since } }).sort({ date: 1 }).lean();

  const byDate = new Map();
  for (const s of snapshots) {
    const key = isoDate(s.date);
    const acc = byDate.get(key) || { date: key, visits: 0, questions: 0, phoneViews: 0, whatsapp: 0, leads: 0 };
    acc.visits += s.visits;
    acc.questions += s.questions;
    acc.phoneViews += s.phoneViews;
    acc.whatsapp += s.whatsapp;
    acc.leads += Object.values(s.leadsByType || {}).reduce((a, b) => a + b, 0);
    byDate.set(key, acc);
  }
  const series = [...byDate.values()];
  const totals = series.reduce(
    (acc, d) => ({
      visits: acc.visits + d.visits,
      questions: acc.questions + d.questions,
      phoneViews: acc.phoneViews + d.phoneViews,
      whatsapp: acc.whatsapp + d.whatsapp,
      leads: acc.leads + d.leads,
    }),
    { visits: 0, questions: 0, phoneViews: 0, whatsapp: 0, leads: 0 }
  );
  return { series, totals };
}
