import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import Lead from '../models/Lead.model.js';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';
import IgMediaMap from '../models/IgMediaMap.model.js';
import MlMetricSnapshot from '../models/MlMetricSnapshot.model.js';
import {
  baDay, bump, emptySeries, parseLimit, parseRange, sortUpcoming, today, totalsOf,
} from '../utils/internal.util.js';

// Módulo /internal del CRM (panel central). Solo lectura.
// Contrato: GET /internal/health · /internal/metrics?desde=&hasta= · /internal/upcoming?limite=
const SERVICE = 'crm';
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// Contadores de la serie diaria
const COUNTERS = ['leads', 'reservas', 'operaciones', 'publicaciones', 'igPosts', 'mlVisitas', 'mlConsultas'];
// Qué contadores propios alimentan cada contador común del panel. mlConsultas queda afuera de
// «consultas» a propósito: las preguntas de MercadoLibre ya entran al CRM como Lead.
const COMMON = {
  publicaciones: ['publicaciones', 'igPosts'],
  consultas: ['leads'],
  ventas: ['reservas', 'operaciones'],
  visitas: ['mlVisitas'],
};

// Mismo criterio que Reportes (funnel.controller.js)
const ADVANCED = new Set(['en_progreso', 'contactado', 'reservado', 'cerrado']);
const CLOSED = new Set(['reservado', 'cerrado']);
// Cambios de estado de una propiedad que cuentan como operación
const OPERATION_STATUS = new Set(['reservada', 'vendida', 'alquilado']);
const UNANSWERED_WINDOW_HOURS = 48;
const MAX_PROPERTIES = 200;

const utcDay = (d) => new Date(d).toISOString().slice(0, 10);
const utcMidnight = (ymd) => new Date(`${ymd}T00:00:00Z`);
const propertyLabel = (p) => p?.address || p?.publication_title || (p?.id ? `Propiedad #${p.id}` : '');
// Cuándo se cargó una reserva: las viejas (importadas) no tienen createdAt, se usa su primer registro
const bookingCreatedAt = (b) => b.createdAt || b.history?.[0]?.at || null;

export function health(_req, res) {
  const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
  res.json({ ok: db === 'up', service: SERVICE, version, uptime: Math.round(process.uptime()), db, now: new Date().toISOString() });
}

export async function metrics(req, res, next) {
  try {
    const range = parseRange(req.query);
    const created = { createdAt: { $gte: range.from, $lt: range.to } };
    const [leads, rentals, statusChanges, altas, igPosts, snapshots] = await Promise.all([
      Lead.find(created, { source: 1, status: 1, propertyId: 1, propertyTitle: 1, createdAt: 1, 'attribution.channel': 1 }).lean(),
      Property.find(
        { 'temporaryRental.bookings.0': { $exists: true } },
        { id: 1, address: 1, publication_title: 1, 'temporaryRental.bookings': 1 },
      ).lean(),
      Activity.find({ ...created, type: 'property_status_changed' }, { entityId: 1, createdAt: 1, 'meta.newStatus': 1 }).lean(),
      Activity.find({ ...created, type: 'property_created' }, { entityId: 1, createdAt: 1, 'meta.address': 1 }).lean(),
      IgMediaMap.find(created, { property_id: 1, createdAt: 1 }).lean(),
      // Los snapshots de MercadoLibre se guardan con la medianoche UTC del día que representan
      MlMetricSnapshot.find({ date: { $gte: utcMidnight(range.desde), $lt: utcMidnight(range.hastaNext) } }).lean(),
    ]);

    const series = emptySeries(range, COUNTERS);
    const props = new Map();
    const prop = (id, title = '') => {
      const key = String(id);
      if (!props.has(key)) {
        props.set(key, { propertyId: key, title: '', leads: 0, reservas: 0, operaciones: 0, igPosts: 0, mlVisitas: 0, mlConsultas: 0, publicadaEl: null });
      }
      const row = props.get(key);
      if (title && !row.title) row.title = title;
      return row;
    };

    const leadsPorOrigen = {};
    const leadsWebPorCanal = {};
    let leadsAvanzaron = 0;
    let leadsCerrados = 0;
    for (const lead of leads) {
      bump(series, baDay(lead.createdAt), 'leads');
      const source = lead.source || 'otro';
      leadsPorOrigen[source] = (leadsPorOrigen[source] || 0) + 1;
      if (source === 'web') {
        const channel = lead.attribution?.channel || 'sin dato';
        leadsWebPorCanal[channel] = (leadsWebPorCanal[channel] || 0) + 1;
      }
      if (ADVANCED.has(lead.status)) leadsAvanzaron += 1;
      if (CLOSED.has(lead.status)) leadsCerrados += 1;
      if (lead.propertyId) prop(lead.propertyId, lead.propertyTitle).leads += 1;
    }

    const reservasMonto = {};
    for (const p of rentals) {
      for (const b of p.temporaryRental?.bookings || []) {
        const at = bookingCreatedAt(b);
        if (b.status === 'bloqueado' || !at || at < range.from || at >= range.to) continue;
        bump(series, baDay(at), 'reservas');
        prop(p.id, propertyLabel(p)).reservas += 1;
        if (Number.isFinite(b.total) && b.total > 0) {
          const currency = b.currency || 'sin moneda';
          reservasMonto[currency] = (reservasMonto[currency] || 0) + b.total;
        }
      }
    }

    const operacionesPorEstado = {};
    for (const act of statusChanges) {
      const status = act.meta?.newStatus;
      if (!OPERATION_STATUS.has(status)) continue;
      bump(series, baDay(act.createdAt), 'operaciones');
      operacionesPorEstado[status] = (operacionesPorEstado[status] || 0) + 1;
      if (act.entityId) prop(act.entityId).operaciones += 1;
    }

    for (const act of altas) {
      const day = baDay(act.createdAt);
      bump(series, day, 'publicaciones');
      if (act.entityId) prop(act.entityId, act.meta?.address).publicadaEl = day;
    }

    for (const post of igPosts) {
      bump(series, baDay(post.createdAt), 'igPosts');
      if (post.property_id) prop(post.property_id).igPosts += 1;
    }

    for (const s of snapshots) {
      const day = utcDay(s.date);
      const consultas = Object.values(s.leadsByType || {}).reduce((a, b) => a + (Number(b) || 0), 0);
      bump(series, day, 'mlVisitas', s.visits || 0);
      bump(series, day, 'mlConsultas', consultas);
      const row = prop(s.propertyId);
      row.mlVisitas += s.visits || 0;
      row.mlConsultas += consultas;
    }

    // Título de las propiedades que quedaron sin nombre (las que solo tienen visitas u operaciones)
    const untitled = [...props.values()].filter((r) => !r.title).map((r) => Number(r.propertyId)).filter(Number.isFinite);
    if (untitled.length) {
      const found = await Property.find({ id: { $in: untitled } }, { id: 1, address: 1, publication_title: 1 }).lean();
      found.forEach((p) => { prop(p.id, propertyLabel(p)); });
    }

    const byProperty = [...props.values()]
      .sort((a, b) => (b.leads - a.leads) || (b.mlVisitas - a.mlVisitas) || (b.reservas - a.reservas))
      .slice(0, MAX_PROPERTIES);

    res.json({
      service: SERVICE,
      desde: range.desde,
      hasta: range.hasta,
      totals: {
        ...totalsOf(series, COUNTERS),
        leadsPorOrigen,
        leadsWebPorCanal,
        leadsAvanzaron,
        leadsCerrados,
        operacionesPorEstado,
        reservasMonto,
      },
      common: COMMON,
      series: [...series.values()],
      byProperty,
    });
  } catch (error) {
    next(error);
  }
}

export async function upcoming(req, res, next) {
  try {
    const limite = parseLimit(req.query);
    const hoy = today();
    const now = Date.now();
    const since = new Date(now - UNANSWERED_WINDOW_HOURS * 60 * 60 * 1000);
    const [rentals, sinResponder, sinResponderViejas] = await Promise.all([
      Property.find(
        { 'temporaryRental.bookings.0': { $exists: true } },
        { id: 1, address: 1, publication_title: 1, 'temporaryRental.bookings': 1 },
      ).lean(),
      Lead.countDocuments({ status: 'nuevo', createdAt: { $gte: since } }),
      Lead.countDocuments({ status: 'nuevo', createdAt: { $lt: since } }),
    ]);

    // Entradas (14 h) y salidas (10 h) de temporada, igual que las muestra la Agenda
    const items = [];
    for (const p of rentals) {
      const house = propertyLabel(p);
      for (const b of p.temporaryRental?.bookings || []) {
        if (b.status === 'bloqueado' || !b.startDate || !b.endDate) continue;
        const base = {
          pending: false,
          who: b.agentName || b.createdByName || '',
          status: b.status || 'reservado',
          propertyId: String(p.id),
          ref: String(b._id),
        };
        const inDay = utcDay(b.startDate);
        const outDay = utcDay(b.endDate);
        // El tipo (entrada / salida) va en «kind»: el título es quién y dónde
        const title = `${b.guestName || 'Reserva'} en ${house}`;
        if (inDay >= hoy) items.push({ ...base, kind: 'entrada', title, date: `${inDay}T14:00` });
        if (outDay >= hoy) items.push({ ...base, kind: 'salida', title, date: `${outDay}T10:00` });
      }
    }

    const pending = [];
    if (sinResponder || sinResponderViejas) {
      pending.push({
        kind: 'consultas_sin_responder',
        title: `${sinResponder} ${sinResponder === 1 ? 'consulta' : 'consultas'} sin responder en las últimas ${UNANSWERED_WINDOW_HOURS} h`,
        date: hoy,
        pending: true,
        who: '',
        status: sinResponderViejas ? `${sinResponderViejas} más viejas siguen en «nuevo»` : '',
        propertyId: null,
        ref: 'leads-nuevos',
      });
    }

    res.json({
      service: SERVICE,
      generatedAt: new Date(now).toISOString(),
      items: [...sortUpcoming(items).slice(0, limite), ...pending],
    });
  } catch (error) {
    next(error);
  }
}
