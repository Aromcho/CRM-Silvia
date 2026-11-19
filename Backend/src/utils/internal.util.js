// Helpers del módulo /internal (panel central). Este archivo es igual en todos los backends
// Express: si lo cambiás en uno, copialo a los demás.
//
// Las fechas del contrato son días de Buenos Aires (YYYY-MM-DD). Argentina no tiene horario de
// verano: UTC-3 fijo.
const BA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.statusCode = 400;
  return error;
}

const isYmd = (s) => typeof s === 'string' && YMD.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// Día de Buenos Aires (YYYY-MM-DD) de una fecha
export const baDay = (d) => new Date(new Date(d).getTime() - BA_OFFSET_MS).toISOString().slice(0, 10);
// Fecha y hora de Buenos Aires sin zona (YYYY-MM-DDTHH:mm)
export const baLocal = (d) => new Date(new Date(d).getTime() - BA_OFFSET_MS).toISOString().slice(0, 16);
export const today = () => baDay(Date.now());
export const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
// Medianoche de Buenos Aires de un día, como Date
export const baMidnight = (ymd) => new Date(`${ymd}T00:00:00-03:00`);

// ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD, los dos inclusive. Sin parámetros: los últimos 30 días.
// Devuelve el rango de dos formas: como texto (para campos guardados como String) y como Date.
export function parseRange(query = {}) {
  if (query.desde !== undefined && !isYmd(query.desde)) throw badRequest('desde tiene que ser una fecha YYYY-MM-DD');
  if (query.hasta !== undefined && !isYmd(query.hasta)) throw badRequest('hasta tiene que ser una fecha YYYY-MM-DD');
  const hasta = query.hasta || today();
  const desde = query.desde || addDays(hasta, -(DEFAULT_RANGE_DAYS - 1));
  if (desde > hasta) throw badRequest('desde no puede ser posterior a hasta');
  const days = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) throw badRequest(`El rango máximo es de ${MAX_RANGE_DAYS} días`);
  const hastaNext = addDays(hasta, 1);
  return { desde, hasta, hastaNext, days, from: baMidnight(desde), to: baMidnight(hastaNext) };
}

export function parseLimit(query = {}, fallback = 20, max = 100) {
  const n = parseInt(query.limite, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

// Serie diaria: una fila por día del rango, con todos los contadores en 0
export function emptySeries(range, counters) {
  const series = new Map();
  for (let day = range.desde; day <= range.hasta; day = addDays(day, 1)) {
    const row = { date: day };
    counters.forEach((c) => { row[c] = 0; });
    series.set(day, row);
  }
  return series;
}

export function bump(series, day, counter, n = 1) {
  const row = series.get(day);
  if (row) row[counter] += n;
}

export function totalsOf(series, counters) {
  const totals = {};
  counters.forEach((c) => { totals[c] = 0; });
  for (const row of series.values()) counters.forEach((c) => { totals[c] += row[c]; });
  return totals;
}

// Orden de «upcoming»: primero lo que tiene fecha, de más cerca a más lejos; después los pendientes
export function sortUpcoming(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.pending) !== Boolean(b.pending)) return a.pending ? 1 : -1;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });
}
