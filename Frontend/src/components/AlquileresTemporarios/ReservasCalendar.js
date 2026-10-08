'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { photoSrc } from '@/lib/data';
import {
  MONTH_NAMES, MONTH_SHORT, parseDateOnly, toISODate, nightsBetween, findOverlap, nightBooked,
  capacityInfo, propertyTitle, whatsappHref, bookingKey, bookingTiming, normalizeSearch, useEscape,
  shortDay, longDay, nightsLabel,
} from './rentalUtils';
import './ReservasCalendar.css';

const e = React.createElement;
const { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } = React;

const WEEKDAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

// Las filas se agrupan por capacidad, con el mismo criterio que el filtro "Personas"
const GROUPS = [
  { key: '1-4', label: '1 a 4 personas' },
  { key: '5-7', label: '5 a 7 personas' },
  { key: '8-12', label: '8 a 12 personas' },
  { key: 'none', label: 'Capacidad sin definir' },
];

function addDays(iso, n) {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function dayDiff(fromIso, toIso) {
  return Math.round((parseDateOnly(toIso) - parseDateOnly(fromIso)) / 86400000);
}

function bookingLabel(b) {
  return b.guestName?.trim() || (b.status === 'bloqueado' ? 'Bloqueado' : b.notes?.trim() || 'Reservado');
}

// Posición horizontal de una barra dentro de la fila, en días (0 = inicio del mes)
function barStyle(from, to, days) {
  return { left: `calc(${(from / days) * 100}% + 2px)`, width: `calc(${((to - from) / days) * 100}% - 4px)` };
}

function sameMonth(a, b) {
  return a.y === b.y && a.m === b.m;
}

// Tarjeta flotante anclada a un elemento (barra o día). En celular se muestra abajo, a lo ancho.
function Popover({ anchor, label, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  useEscape(onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let top = anchor.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6);
    const left = Math.min(Math.max(8, anchor.left), window.innerWidth - w - 8);
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const onDown = (ev) => { if (ref.current && !ref.current.contains(ev.target)) onClose(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return e('div', { ref, className: 'tl-pop', role: 'dialog', 'aria-label': label, style: pos }, children);
}

function BookingPopover({ row, item, onEdit, onDelete, onReceipt, onClose }) {
  const { b } = item;
  const p = row.property;
  const blocked = b.status === 'bloqueado';
  const timing = bookingTiming(b);
  const nights = nightsBetween(item.s, item.e);
  const wa = whatsappHref(b.guestPhone);
  const cap = capacityInfo(p);

  return e(React.Fragment, null,
    e('div', { className: 'tl-pop-head' },
      e('span', { className: `status-badge badge-${blocked ? 'vendida' : 'reservada'}` }, blocked ? 'Bloqueado' : 'Reservado'),
      timing && e('span', { className: `booking-timing ${timing.key}` }, timing.label),
      e('button', { type: 'button', className: 'tl-pop-close', onClick: onClose, 'aria-label': 'Cerrar' }, e(Icons.Close, { width: 14, height: 14 })),
    ),
    e('div', { className: 'tl-pop-title' }, b.guestName?.trim() || (blocked ? 'Fechas bloqueadas' : 'Reserva sin nombre')),

    e('div', { className: 'tl-pop-stay' },
      e('div', { className: 'tl-pop-when in' },
        e('span', { className: 'tl-pop-when-label' }, e(Icons.LogIn, { width: 12, height: 12 }), 'Entrada'),
        e('strong', null, shortDay(item.s)),
      ),
      e('div', { className: 'tl-pop-nights' }, e('span', null, nightsLabel(nights))),
      e('div', { className: 'tl-pop-when out' },
        e('span', { className: 'tl-pop-when-label' }, e(Icons.LogOut, { width: 12, height: 12 }), 'Salida'),
        e('strong', null, shortDay(item.e)),
      ),
    ),

    e('div', { className: 'tl-pop-rows' },
      e('div', { className: 'tl-pop-row' }, e(Icons.Building, { width: 13, height: 13 }),
        e('span', null, propertyTitle(p), cap && e('span', { className: 'tl-muted' }, ` · ${cap.short}`))),
      b.guestPhone && e('div', { className: 'tl-pop-row' },
        wa
          ? e(React.Fragment, null, e(Icons.WhatsApp, { width: 13, height: 13 }), e('a', { href: wa, target: '_blank', rel: 'noopener noreferrer', className: 'booking-wa' }, b.guestPhone))
          : e(React.Fragment, null, e(Icons.Phone, { width: 13, height: 13 }), e('span', null, b.guestPhone))),
      b.notes?.trim() && e('div', { className: 'tl-pop-row notes' }, e(Icons.FileText, { width: 13, height: 13 }), e('span', null, b.notes)),
    ),

    e('div', { className: 'tl-pop-actions' },
      e('button', { type: 'button', className: 'btn primary sm', onClick: () => onEdit(p, b) }, e(Icons.Edit, { width: 13, height: 13 }), 'Editar reserva'),
      e('button', { type: 'button', className: 'icon-btn', title: 'Recibo de reserva', 'aria-label': 'Recibo de reserva', onClick: () => onReceipt(p, b) },
        e(Icons.FileText, { width: 13, height: 13 })),
      e('button', { type: 'button', className: 'icon-btn danger', title: 'Eliminar reserva', 'aria-label': 'Eliminar reserva', onClick: () => onDelete(p, b, item.idx) },
        e(Icons.Trash, { width: 13, height: 13 })),
    ),
  );
}

function DayPopover({ iso, rows, todayIso, onEdit, onNewOnDay, onClose }) {
  const ins = [], outs = [], free = [];
  for (const r of rows) {
    let busy = false;
    for (const item of r.bookings) {
      if (item.s === iso) ins.push({ r, item });
      if (item.e === iso) outs.push({ r, item });
      if (nightBooked(iso, item.b)) busy = true;
    }
    if (!busy) free.push(r.property);
  }
  const canCreate = iso >= todayIso && free.length > 0;

  function section(title, icon, tone, list) {
    return e('div', { className: 'tl-day-sec' },
      e('div', { className: `tl-day-sec-title ${tone}` }, e(icon, { width: 13, height: 13 }), title, e('span', { className: 'tl-day-sec-n' }, list.length)),
      list.length === 0
        ? e('div', { className: 'tl-day-none' }, 'Ninguna')
        : list.map(({ r, item }) => e('button', {
          key: `${r.property.id}-${bookingKey(item.b, item.idx)}`, type: 'button', className: 'tl-day-item',
          onClick: () => onEdit(r.property, item.b), title: 'Abrir la reserva',
        },
          e('span', { className: 'tl-day-item-title' }, propertyTitle(r.property)),
          e('span', { className: 'tl-muted' }, bookingLabel(item.b)),
        )),
    );
  }

  return e(React.Fragment, null,
    e('div', { className: 'tl-pop-head' },
      e('span', { className: 'tl-pop-day' }, longDay(iso)),
      e('button', { type: 'button', className: 'tl-pop-close', onClick: onClose, 'aria-label': 'Cerrar' }, e(Icons.Close, { width: 14, height: 14 })),
    ),
    e('div', { className: 'tl-day-summary' },
      e('span', { className: 'tl-day-pill busy' }, e('strong', null, rows.length - free.length), ' ocupadas'),
      e('span', { className: 'tl-day-pill free' }, e('strong', null, free.length), ' libres'),
      e('span', { className: 'tl-muted' }, `de ${rows.length}`),
    ),
    section('Entradas', Icons.LogIn, 'in', ins),
    section('Salidas', Icons.LogOut, 'out', outs),
    e('div', { className: 'tl-pop-actions' },
      e('button', {
        type: 'button', className: 'btn primary sm', disabled: !canCreate,
        title: iso < todayIso ? 'Es un día pasado' : free.length === 0 ? 'No hay propiedades libres ese día' : undefined,
        onClick: () => onNewOnDay(iso, free),
      }, e(Icons.Plus, { width: 13, height: 13 }), 'Nueva reserva desde este día'),
    ),
  );
}

function CalendarLegend() {
  return e('div', { className: 'tl-legend' },
    e('span', null, e('i', { className: 'tl-swatch reservado' }), 'Reservado'),
    e('span', null, e('i', { className: 'tl-swatch bloqueado' }), 'Bloqueado'),
    e('span', null, e(Icons.LogIn, { width: 12, height: 12 }), 'Entrada'),
    e('span', null, e(Icons.LogOut, { width: 12, height: 12 }), 'Salida'),
    e('span', null, e('i', { className: 'tl-mark in' }), e('i', { className: 'tl-mark out' }), 'Hay entradas / salidas ese día'),
    e('span', { className: 'tl-legend-tip' }, e(Icons.Plus, { width: 12, height: 12 }), 'Hacé click en un día libre para cargar una reserva'),
  );
}

// "¿Qué fechas?": entrada y salida para encontrar propiedades libres. Va junto al filtro de personas.
export function AvailabilityFilter({ range, onChange }) {
  function changeStart(v) {
    onChange({ start: v, end: range.end && v && range.end > v ? range.end : '' });
  }
  return e('div', { className: 'tl-avail', role: 'group', 'aria-label': 'Buscar propiedades libres entre dos fechas' },
    e('span', { className: 'tl-avail-label' }, e(Icons.Calendar, { width: 14, height: 14 }), 'Fechas'),
    e('label', { className: 'tl-date' }, e('span', null, 'Entrada'),
      e('input', { type: 'date', value: range.start, onChange: (ev) => changeStart(ev.target.value) })),
    e(Icons.ArrowRight, { width: 13, height: 13, className: 'tl-avail-arrow' }),
    e('label', { className: 'tl-date' }, e('span', null, 'Salida'),
      e('input', { type: 'date', value: range.end, min: range.start ? addDays(range.start, 1) : undefined, onChange: (ev) => onChange({ ...range, end: ev.target.value }) })),
    (range.start || range.end) && e('button', {
      type: 'button', className: 'icon-btn', title: 'Borrar fechas', 'aria-label': 'Borrar fechas',
      onClick: () => onChange({ start: '', end: '' }),
    }, e(Icons.Close, { width: 13, height: 13 })),
  );
}

export default function ReservasCalendar({ properties, search, capacity, range, onRangeChange, onEdit, onOpenProperty, onNew, onNewOnDay, onDelete, onReceipt }) {
  const todayIso = toISODate(new Date());
  const [month, setMonth] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [onlyBooked, setOnlyBooked] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);
  const [pop, setPop] = useState(null);
  const scrollerRef = useRef(null);
  const popScrollRef = useRef(null);
  const closePop = useCallback(() => setPop(null), []);

  // La tarjeta flotante queda anclada a la pantalla: si se scrollea la grilla de verdad, se cierra.
  // (Se ignoran los corrimientos chicos, como el que hace el navegador al enfocar lo que se clickeó.)
  function openPop(next) {
    const sc = scrollerRef.current;
    popScrollRef.current = sc ? { top: sc.scrollTop, left: sc.scrollLeft } : null;
    setPop((cur) => (cur?.key === next.key ? null : next));
  }

  function handleScroll() {
    const sc = scrollerRef.current, start = popScrollRef.current;
    if (!pop || !sc || !start) return;
    if (Math.abs(sc.scrollTop - start.top) + Math.abs(sc.scrollLeft - start.left) > 40) setPop(null);
  }

  const days = new Date(month.y, month.m + 1, 0).getDate();
  const monthStart = toISODate(new Date(month.y, month.m, 1));
  const monthEnd = toISODate(new Date(month.y, month.m, days));
  const isCurrentMonth = todayIso >= monthStart && todayIso <= monthEnd;
  const rangeOn = Boolean(range.start && range.end && range.start < range.end);

  function goTo(y, m) {
    const d = new Date(y, m, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
    setPop(null);
  }
  const shiftMonth = (delta) => goTo(month.y, month.m + delta);

  // Al elegir la fecha de entrada en "Fechas", el calendario salta a ese mes
  useEffect(() => {
    const d = parseDateOnly(range.start);
    if (d) goTo(d.getFullYear(), d.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start]);

  // Reservas de cada propiedad, con fechas normalizadas y ordenadas
  const entries = useMemo(() => properties.map((p) => ({
    property: p,
    group: p.temporaryRental?.capacityGroup || 'none',
    bookings: (p.temporaryRental?.bookings || [])
      .map((b, idx) => ({ b, idx, s: b.startDate?.slice(0, 10), e: b.endDate?.slice(0, 10) }))
      .filter((x) => x.s && x.e)
      .sort((x, y) => x.s.localeCompare(y.s)),
  })), [properties]);

  // Capacidad + búsqueda. Si lo buscado es un huésped (y no la propiedad), se resaltan sus reservas.
  const q = normalizeSearch(search.trim());
  const filtered = useMemo(() => entries.reduce((out, en) => {
    if (capacity && en.group !== capacity) return out;
    let matches = null;
    if (q) {
      const p = en.property;
      if (!normalizeSearch(`${propertyTitle(p)} ${p.address} ${p.temporaryRental?.localidad}`).includes(q)) {
        matches = new Set(en.bookings
          .filter(({ b }) => normalizeSearch(`${b.guestName} ${b.guestPhone} ${b.notes}`).includes(q))
          .map((x) => x.idx));
        if (!matches.size) return out;
      }
    }
    out.push({ ...en, matches });
    return out;
  }, []), [entries, capacity, q]);

  const rows = useMemo(() => filtered.map((r) => ({
    ...r,
    visible: r.bookings.filter((x) => x.s <= monthEnd && x.e >= monthStart),
    next: r.bookings.find((x) => x.s > monthEnd && x.e >= todayIso),
    free: rangeOn ? !findOverlap(r.property.temporaryRental?.bookings, range.start, range.end) : null,
  })), [filtered, monthStart, monthEnd, todayIso, rangeOn, range.start, range.end]);

  const shown = rows.filter((r) => (!onlyBooked || r.visible.length > 0) && (!rangeOn || !onlyFree || r.free));
  const groups = GROUPS
    .map((g) => ({ ...g, rows: shown.filter((r) => r.group === g.key).sort((a, b) => propertyTitle(a.property).localeCompare(propertyTitle(b.property), 'es')) }))
    .filter((g) => g.rows.length > 0);

  const monthCount = rows.reduce((n, r) => n + r.visible.length, 0);
  const freeCount = rangeOn ? rows.filter((r) => r.free).length : 0;

  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => {
    const date = new Date(month.y, month.m, i + 1);
    const iso = toISODate(date);
    return { iso, num: i + 1, dow: date.getDay(), weekend: date.getDay() === 0 || date.getDay() === 6, today: iso === todayIso };
  }), [month.y, month.m, days, todayIso]);

  // Entradas y salidas por día (para los puntitos de la fila de días)
  const moves = useMemo(() => {
    const m = {};
    for (const r of rows) {
      for (const x of r.visible) {
        (m[x.s] || (m[x.s] = { in: 0, out: 0 })).in += 1;
        (m[x.e] || (m[x.e] = { in: 0, out: 0 })).out += 1;
      }
    }
    return m;
  }, [rows]);

  // Meses (desde el actual) que tienen reservas, para saltar directo
  const jumpMonths = useMemo(() => {
    const t = new Date();
    const out = [];
    for (let k = 0; k < 12; k++) {
      const d = new Date(t.getFullYear(), t.getMonth() + k, 1);
      const s = toISODate(d), en = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      const n = filtered.reduce((acc, r) => acc + r.bookings.filter((x) => x.s <= en && x.e >= s).length, 0);
      if (n) out.push({ y: d.getFullYear(), m: d.getMonth(), n });
    }
    return out;
  }, [filtered]);
  const nextJump = jumpMonths.find((j) => j.y * 12 + j.m > month.y * 12 + month.m);

  // Al cambiar de mes, se lleva el scroll horizontal a hoy (o al inicio del rango buscado)
  const focusIso = rangeOn && range.start >= monthStart && range.start <= monthEnd ? range.start : isCurrentMonth ? todayIso : null;
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;
    const cell = focusIso && sc.querySelector(`[data-day="${focusIso}"]`);
    const corner = sc.querySelector('.tl-corner');
    if (!cell || !corner) { sc.scrollLeft = 0; return; }
    const x = cell.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft;
    sc.scrollLeft = Math.max(0, x - corner.offsetWidth - cell.offsetWidth * 2);
  }, [focusIso, monthStart]);

  function openBooking(ev, row, item) {
    const key = `${row.property.id}-${bookingKey(item.b, item.idx)}`;
    openPop({ kind: 'booking', key, anchor: ev.currentTarget.getBoundingClientRect(), row, item });
  }

  function openDay(ev, iso) {
    openPop({ kind: 'day', key: `day-${iso}`, anchor: ev.currentTarget.getBoundingClientRect(), iso });
  }

  // Cada acción cierra la tarjeta antes de abrir el modal o el diálogo
  const act = (fn) => (...args) => { setPop(null); fn(...args); };

  function renderBar(row, item) {
    const { b } = item;
    const start = dayDiff(monthStart, item.s) + 0.5;
    const end = Math.max(dayDiff(monthStart, item.e) + 0.5, start + 0.5);
    const from = Math.max(0, start), to = Math.min(days, end);
    const span = to - from;
    const timing = bookingTiming(b);
    const nights = nightsBetween(item.s, item.e);
    const blocked = b.status === 'bloqueado';
    const label = bookingLabel(b);
    const key = `${row.property.id}-${bookingKey(b, item.idx)}`;
    const cls = [
      'tl-booking', blocked ? 'bloqueado' : 'reservado',
      timing?.key === 'past' && 'past', timing?.key === 'now' && 'now',
      start < 0 && 'cont-left', end > days && 'cont-right',
      span < 6 && 'narrow', span < 3 && 'compact', span < 1.6 && 'tiny',
      row.matches && (row.matches.has(item.idx) ? 'match' : 'dimmed'),
      pop?.key === key && 'active',
    ].filter(Boolean).join(' ');

    return e('button', {
      key, type: 'button', className: cls, style: barStyle(from, to, days),
      onClick: (ev) => openBooking(ev, row, item),
      title: `${label} · Entrada ${shortDay(item.s)} → Salida ${shortDay(item.e)} · ${nightsLabel(nights)}`,
      'aria-label': `${blocked ? 'Bloqueo' : 'Reserva'}: ${label}. Entrada ${longDay(item.s)}, salida ${longDay(item.e)}`,
    },
      start >= 0 && e(Icons.LogIn, { width: 11, height: 11, className: 'tl-bar-icon' }),
      e('span', { className: 'tl-bar-text' }, label),
      e('span', { className: 'tl-bar-nights' }, nightsLabel(nights)),
      end <= days && e(Icons.LogOut, { width: 11, height: 11, className: 'tl-bar-icon' }),
    );
  }

  function renderRow(row) {
    const p = row.property;
    const cap = capacityInfo(p);
    const src = photoSrc(p.photos?.[0]);
    const dim = rangeOn && !row.free;

    // Noches ocupadas del mes. El día de salida queda libre para que entre otra reserva.
    const busy = new Set(dayList.filter((d) => row.visible.some((x) => nightBooked(d.iso, x.b))).map((d) => d.iso));

    let ghost = null;
    if (rangeOn && row.free) {
      const from = Math.max(0, dayDiff(monthStart, range.start) + 0.5);
      const to = Math.min(days, dayDiff(monthStart, range.end) + 0.5);
      if (to > from) {
        ghost = e('button', {
          type: 'button', className: `tl-ghost${to - from < 3 ? ' compact' : ''}`, style: barStyle(from, to, days),
          onClick: () => onNew(p, { start: range.start, end: range.end }),
          title: `Reservar del ${shortDay(range.start)} al ${shortDay(range.end)}`,
        }, e(Icons.Plus, { width: 12, height: 12 }), e('span', null, 'Libre · reservar'));
      }
    }

    const details = [cap?.short, p.temporaryRental?.localidad].filter(Boolean).join(' · ');

    return e('div', { key: p.id, className: `tl-row${dim ? ' dim' : ''}` },
      e('button', {
        type: 'button', className: 'tl-label', onClick: () => onOpenProperty(p),
        title: `${propertyTitle(p)}${details ? ` (${details})` : ''} — ver y cargar reservas`,
      },
        src ? e('img', { src, alt: '', loading: 'lazy' }) : e('span', { className: 'tl-noimg' }, e(Icons.Building, { width: 13, height: 13 })),
        e('span', { className: 'tl-label-title' }, propertyTitle(p)),
      ),
      e('div', { className: 'tl-track' },
        // Mes sin reservas para esta propiedad: atajo a la próxima
        row.visible.length === 0 && row.next && !rangeOn && e('button', {
          type: 'button', className: 'tl-next', title: `${bookingLabel(row.next.b)} · ${shortDay(row.next.s)} → ${shortDay(row.next.e)}`,
          onClick: () => { const d = parseDateOnly(row.next.s); goTo(d.getFullYear(), d.getMonth()); },
        }, `Próxima reserva: ${shortDay(row.next.s)}`, e(Icons.Chevron, { width: 11, height: 11 })),
        dayList.map((d) => {
          const clickable = !busy.has(d.iso) && d.iso >= todayIso;
          const inRange = rangeOn && d.iso >= range.start && d.iso <= range.end;
          return e('div', {
            key: d.iso,
            className: `tl-cell${d.weekend ? ' weekend' : ''}${d.today ? ' today' : ''}${inRange ? ' in-range' : ''}${clickable ? ' free' : ''}`,
            onClick: clickable ? () => onNew(p, { start: d.iso }) : undefined,
            title: clickable ? `Nueva reserva desde el ${shortDay(d.iso)}` : undefined,
          });
        }),
        ghost,
        row.visible.map((item) => renderBar(row, item)),
      ),
    );
  }

  let info = null;
  if (rangeOn) {
    const n = nightsBetween(range.start, range.end);
    info = e('div', { className: 'tl-info avail' },
      e(Icons.Check, { width: 14, height: 14 }),
      e('span', null, e('strong', null, `${freeCount} de ${rows.length}`), ` propiedades libres del ${shortDay(range.start)} al ${shortDay(range.end)} (${nightsLabel(n)})`),
      e('button', { type: 'button', className: `st-chip${onlyFree ? ' on disponible' : ''}`, 'aria-pressed': onlyFree, onClick: () => setOnlyFree((v) => !v) },
        onlyFree && e(Icons.Check, { width: 12, height: 12 }), 'Ver solo libres'),
      range.end > monthEnd && e('button', { type: 'button', className: 'btn ghost xs', onClick: () => shiftMonth(1) },
        `Sigue en ${MONTH_NAMES[(month.m + 1) % 12].toLowerCase()}`, e(Icons.Chevron, { width: 12, height: 12 })),
      e('button', { type: 'button', className: 'btn ghost xs tl-info-end', onClick: () => onRangeChange({ start: '', end: '' }) }, 'Borrar fechas'),
    );
  } else if (range.start && !range.end) {
    info = e('div', { className: 'tl-info' }, e(Icons.Calendar, { width: 14, height: 14 }), 'Elegí la fecha de salida para ver qué propiedades están libres.');
  } else if (monthCount === 0 && rows.length > 0) {
    info = e('div', { className: 'tl-info' },
      e(Icons.Calendar, { width: 14, height: 14 }),
      `No hay reservas en ${MONTH_NAMES[month.m].toLowerCase()}.`,
      nextJump && e('button', { type: 'button', className: 'btn ghost xs', onClick: () => goTo(nextJump.y, nextJump.m) },
        `Ir a ${MONTH_NAMES[nextJump.m].toLowerCase()} (${nextJump.n} ${nextJump.n === 1 ? 'reserva' : 'reservas'})`, e(Icons.Chevron, { width: 12, height: 12 })),
    );
  }

  const emptyText = rangeOn && onlyFree ? 'No hay propiedades libres en esas fechas'
    : onlyBooked ? `Ninguna propiedad tiene reservas en ${MONTH_NAMES[month.m].toLowerCase()}`
      : 'No hay propiedades con estos filtros';
  const thisYear = new Date().getFullYear();

  return e('div', { className: 'res-cal' },
    e('div', { className: 'tl-bar' },
      e('div', { className: 'tl-nav' },
        e('button', { type: 'button', className: 'icon-btn', onClick: () => shiftMonth(-1), 'aria-label': 'Mes anterior', title: 'Mes anterior' }, e(Icons.ChevronLeft, { width: 15, height: 15 })),
        e('div', { className: 'tl-month', 'aria-live': 'polite' },
          e('span', { className: 'tl-month-name' }, `${MONTH_NAMES[month.m]} ${month.y}`),
          e('span', { className: 'tl-month-sub' }, monthCount ? `${monthCount} ${monthCount === 1 ? 'reserva' : 'reservas'}` : 'Sin reservas'),
        ),
        e('button', { type: 'button', className: 'icon-btn', onClick: () => shiftMonth(1), 'aria-label': 'Mes siguiente', title: 'Mes siguiente' }, e(Icons.Chevron, { width: 15, height: 15 })),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: () => { const t = new Date(); goTo(t.getFullYear(), t.getMonth()); }, disabled: isCurrentMonth }, 'Hoy'),
      ),

      jumpMonths.length > 0 && e('div', { className: 'tl-jump', role: 'group', 'aria-label': 'Meses con reservas' },
        e('span', { className: 'tl-jump-label' }, 'Con reservas:'),
        jumpMonths.map((j) => e('button', {
          key: `${j.y}-${j.m}`, type: 'button', className: `tl-jump-chip${sameMonth(j, month) ? ' on' : ''}`,
          onClick: () => goTo(j.y, j.m), title: `${MONTH_NAMES[j.m]} ${j.y}: ${j.n} ${j.n === 1 ? 'reserva' : 'reservas'}`,
        }, `${MONTH_SHORT[j.m]}${j.y !== thisYear ? ` ${String(j.y).slice(2)}` : ''}`, e('span', { className: 'tl-jump-n' }, j.n))),
      ),

      e('button', {
        type: 'button', className: `st-chip tl-only-booked${onlyBooked ? ' on reservada' : ''}`, 'aria-pressed': onlyBooked,
        onClick: () => setOnlyBooked((v) => !v), title: 'Ocultar las propiedades sin reservas en el mes que estás viendo',
      }, onlyBooked && e(Icons.Check, { width: 12, height: 12 }), 'Solo con reservas en el mes'),
    ),

    info,

    e('div', { className: 'tl-scroller', ref: scrollerRef, style: { '--days': days }, onScroll: handleScroll },
      e('div', { className: 'tl-grid' },
        e('div', { className: 'tl-head' },
          e('div', { className: 'tl-corner' }, 'Propiedades', e('span', { className: 'tl-corner-n' }, shown.length)),
          e('div', { className: 'tl-days' }, dayList.map((d) => {
            const mv = moves[d.iso];
            const inRange = rangeOn && d.iso >= range.start && d.iso <= range.end;
            const detail = mv ? ` · ${mv.in} ${mv.in === 1 ? 'entrada' : 'entradas'}, ${mv.out} ${mv.out === 1 ? 'salida' : 'salidas'}` : '';
            return e('button', {
              key: d.iso, type: 'button', 'data-day': d.iso,
              className: `tl-day${d.weekend ? ' weekend' : ''}${d.today ? ' today' : ''}${inRange ? ' in-range' : ''}${pop?.key === `day-${d.iso}` ? ' active' : ''}`,
              onClick: (ev) => openDay(ev, d.iso),
              title: `${longDay(d.iso)}${detail}`,
            },
              e('span', { className: 'tl-day-dow' }, WEEKDAY_SHORT[d.dow]),
              e('span', { className: 'tl-day-num' }, d.num),
              e('span', { className: 'tl-day-marks' },
                mv?.in ? e('i', { className: 'tl-mark in' }) : null,
                mv?.out ? e('i', { className: 'tl-mark out' }) : null),
            );
          })),
        ),
        groups.length === 0
          ? e('div', { className: 'tl-empty' }, e(Icons.Calendar, { width: 28, height: 28 }), e('p', null, emptyText))
          : groups.map((g) => e(React.Fragment, { key: g.key },
            e('div', { className: 'tl-group' }, e('span', { className: 'tl-group-label' }, g.label, e('span', { className: 'tl-group-n' }, g.rows.length))),
            g.rows.map(renderRow),
          )),
      ),
    ),

    e(CalendarLegend),

    pop && e(Popover, { anchor: pop.anchor, onClose: closePop, label: pop.kind === 'day' ? longDay(pop.iso) : 'Detalle de la reserva' },
      pop.kind === 'booking'
        ? e(BookingPopover, { row: pop.row, item: pop.item, onEdit: act(onEdit), onDelete: act(onDelete), onReceipt: act(onReceipt), onClose: closePop })
        : e(DayPopover, { iso: pop.iso, rows, todayIso, onEdit: act(onEdit), onNewOnDay: act(onNewOnDay), onClose: closePop })),
  );
}
