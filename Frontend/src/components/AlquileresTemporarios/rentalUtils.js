'use client';
import React from 'react';

// Helpers de fechas, capacidad y reservas compartidos por la sección de alquileres temporarios
// (listado, modal de la propiedad y calendario de reservas).

export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function parseDateOnly(s) {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d) {
  if (!d) return '';
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "2027-01-02" -> "2 ene 2027" (o sin año si es el año en curso)
export function formatDay(iso, withYear) {
  const d = parseDateOnly(iso);
  if (!d) return '—';
  const showYear = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${showYear ? ` ${d.getFullYear()}` : ''}`;
}

const WEEKDAY_ABBR = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// "sáb 27 dic"
export function shortDay(iso) {
  return `${WEEKDAY_ABBR[parseDateOnly(iso).getDay()]} ${formatDay(iso)}`;
}

// "Sábado 3 de enero" (con el año si no es el actual)
export function longDay(iso) {
  const d = parseDateOnly(iso);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : '';
  return `${WEEKDAY_LONG[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()].toLowerCase()}${year}`;
}

export function nightsLabel(n) {
  return `${n} ${n === 1 ? 'noche' : 'noches'}`;
}

export function nightsBetween(startIso, endIso) {
  const s = parseDateOnly(startIso), en = parseDateOnly(endIso);
  if (!s || !en) return 0;
  return Math.max(0, Math.round((en - s) / 86400000));
}

export function daysFromToday(iso) {
  const d = parseDateOnly(iso);
  if (!d) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

// Reserva que se pisa con la estadía [start, end] (YYYY-MM-DD, entrada y salida). El día de salida
// de una reserva puede ser el de entrada de la siguiente (recambio en el mismo día).
export function findOverlap(bookings, startIso, endIso, skipIdx) {
  return (bookings || []).find((b, i) => i !== skipIdx && b.startDate && b.endDate
    && b.startDate.slice(0, 10) < endIso && b.endDate.slice(0, 10) > startIso);
}

// ¿Alguien duerme en la propiedad la noche de ese día? (de la entrada inclusive a la salida exclusive).
// Una reserva de 0 noches ocupa su único día.
export function nightBooked(iso, booking) {
  const s = booking.startDate?.slice(0, 10), en = booking.endDate?.slice(0, 10);
  if (!s || !en) return false;
  return s === en ? iso === s : iso >= s && iso < en;
}

// Capacidad de personas: el texto libre ("6", "8-10") manda; si no, huéspedes de Tokko;
// si no, el grupo. Misma lógica que Backend/src/utils/rentalCapacity.js (lo que ve la web).
export function capacityNumbers(text) {
  return String(text || '').match(/\d+/g)?.map(Number).filter((n) => n > 0 && n < 100) || [];
}

export function capacityInfo(property) {
  const rental = property?.temporaryRental || {};
  const nums = capacityNumbers(rental.capacity);
  if (nums.length) {
    const min = Math.min(...nums), max = Math.max(...nums);
    return { max, short: min === max ? `${max} pers.` : `${min}-${max} pers.`, exact: true };
  }
  if (property?.guests_amount > 0) return { max: property.guests_amount, short: `${property.guests_amount} pers.`, exact: true };
  if (rental.capacityGroup) return { max: Math.max(...capacityNumbers(rental.capacityGroup)), short: `${rental.capacityGroup} pers.`, exact: false };
  return null;
}

export function capacityGroupFor(max) {
  if (!max) return null;
  if (max <= 4) return '1-4';
  if (max <= 7) return '5-7';
  return '8-12';
}

export function propertyTitle(p) {
  return p?.publication_title || p?.address || 'Sin título';
}

export function whatsappHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function bookingKey(b, i) {
  return b._id || `${b.startDate}-${b.endDate}-${i}`;
}

export function bookingTiming(b) {
  const start = daysFromToday(b.startDate), end = daysFromToday(b.endDate);
  if (start == null || end == null) return null;
  if (end < 0) return { key: 'past', label: 'Finalizada' };
  if (start <= 0) return { key: 'now', label: 'En curso' };
  if (start === 1) return { key: 'soon', label: 'Empieza mañana' };
  if (start <= 7) return { key: 'soon', label: `En ${start} días` };
  return null;
}

// Búsqueda sin mayúsculas ni tildes
export function normalizeSearch(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function useEscape(handler) {
  React.useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') handler(ev); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}
