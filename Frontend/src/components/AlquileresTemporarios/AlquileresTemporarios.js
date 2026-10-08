'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import EditableField from '../UI/EditableField';
import FiltersButton from '../UI/FiltersButton';
import { getProperties, getPropertyById, updateProperty } from '@/services/api';
import { photoSrc, formatPrice, STATUS_LABELS } from '@/lib/data';
import {
  MONTH_NAMES, MONTH_SHORT, parseDateOnly, toISODate, formatDay, nightsBetween, findOverlap, nightBooked,
  capacityNumbers, capacityInfo, capacityGroupFor, propertyTitle, whatsappHref, bookingKey, bookingTiming,
  normalizeSearch, useEscape,
} from './rentalUtils';
import '../Propiedades/Propiedades.css';
import ReservasCalendar, { AvailabilityFilter } from './ReservasCalendar';
import ReservaDetalle from './ReservaDetalle';
import ReciboReserva from './ReciboReserva';
import './AlquileresTemporarios.css';

const e = React.createElement;
const { useState, useEffect, useCallback, useRef, useMemo } = React;

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const LIMIT = 20;

const TABS = [
  { key: 'propiedades', label: 'Propiedades', icon: Icons.Building },
  { key: 'reservas', label: 'Reservas', icon: Icons.Calendar },
  { key: 'ficha', label: 'Ficha de propiedades', short: 'Fichas', icon: Icons.FileText },
];

// Filtro por capacidad de personas (temporaryRental.capacityGroup). 'none' = sin cargar.
const CAPACITY_OPTIONS = [
  { key: '', label: 'Todas' },
  { key: '1-4', label: '1 a 4' },
  { key: '5-7', label: '5 a 7' },
  { key: '8-12', label: '8 a 12' },
  { key: 'none', label: 'Sin definir' },
];

const EMPTY_BOOKING_FORM = { guestName: '', guestPhone: '', notes: '', status: 'reservado' };

const AMENITY_LABELS = { mascotas: 'Mascotas', lavarropas: 'Lavarropas', artPlaya: 'Artículos de playa', escaleras: 'Escaleras', cochera: 'Cochera' };

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function currentSeasonKey() {
  const m = new Date().getMonth(); // 0 = enero
  if (m === 11) return 'diciembre';
  if (m === 0) return 'enero';
  if (m === 1) return 'febrero';
  if (m === 2) return 'marzo';
  return null;
}

function rateHeadline(rate) {
  if (!rate) return null;
  const val = rate.dia ?? rate.semana ?? rate.quincena ?? rate.price;
  if (!val) return null;
  const unit = rate.dia ? '/día' : rate.semana ? '/semana' : rate.quincena ? '/quincena' : '';
  const symbol = rate.currency === 'ARS' ? '$' : 'USD';
  return `desde ${symbol} ${new Intl.NumberFormat('es-AR').format(val)}${unit}`;
}

function seasonTeaser(rental) {
  const rates = rental?.seasonalRates;
  if (!rates) return null;
  const key = currentSeasonKey();
  return rateHeadline(key && rates[key]) || rateHeadline(rates.invierno)
    || rateHeadline(rates.enero) || rateHeadline(rates.febrero) || rateHeadline(rates.marzo) || rateHeadline(rates.diciembre);
}

function fromISODate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isInRange(date, range) {
  if (!range?.start) return false;
  const end = range.end || range.start;
  const d0 = +new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const s = +new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
  const en = +new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return d0 >= Math.min(s, en) && d0 <= Math.max(s, en);
}

function ConfirmDialog({ title, children, confirmLabel = 'Sí, eliminar', onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = useCallback(() => { if (!busy) onCancel(); }, [busy, onCancel]);
  useEscape(cancel);

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar. Probá de nuevo.');
      setBusy(false);
    }
  }

  return e('div', { className: 'confirm-overlay', onClick: (ev) => { ev.stopPropagation(); cancel(); } },
    e('div', { className: 'confirm-dialog', role: 'alertdialog', 'aria-modal': true, onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'confirm-icon' }, e(Icons.Trash, { width: 20, height: 20 })),
      e('h3', { className: 'confirm-title' }, title),
      e('div', { className: 'confirm-body' }, children),
      error && e('div', { className: 'confirm-error' }, e(Icons.AlertTriangle, { width: 13, height: 13 }), error),
      e('div', { className: 'confirm-actions' },
        e('button', { type: 'button', className: 'btn ghost sm', onClick: cancel, disabled: busy }, 'Cancelar'),
        e('button', { type: 'button', className: 'btn danger sm', onClick: confirm, disabled: busy, autoFocus: true },
          e(Icons.Trash, { width: 13, height: 13 }), busy ? 'Eliminando…' : confirmLabel),
      ),
    ),
  );
}

// Resumen de la reserva que se va a borrar, para que quede claro cuál es
function BookingSummary({ booking, property }) {
  const nights = nightsBetween(booking.startDate, booking.endDate);
  return e('div', { className: 'confirm-summary' },
    property && e('div', { className: 'confirm-summary-row strong' }, e(Icons.Building, { width: 13, height: 13 }), propertyTitle(property)),
    e('div', { className: 'confirm-summary-row' }, e(Icons.Calendar, { width: 13, height: 13 }),
      `${formatDay(booking.startDate, true)} → ${formatDay(booking.endDate, true)}`, nights > 0 && e('span', { className: 'muted' }, ` · ${nights} ${nights === 1 ? 'noche' : 'noches'}`)),
    booking.guestName && e('div', { className: 'confirm-summary-row' }, e(Icons.User, { width: 13, height: 13 }), booking.guestName),
  );
}

function AvailabilityCalendar({ bookings, selectedRange, onDayClick, editingIdx }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = selectedRange?.start ? new Date(selectedRange.start) : new Date();
    d.setDate(1);
    return d;
  });
  const cells = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth());

  // Al empezar a editar una reserva, el calendario salta al mes de esa reserva
  useEffect(() => {
    if (editingIdx == null || !selectedRange?.start) return;
    const d = new Date(selectedRange.start); d.setDate(1);
    setViewDate(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingIdx]);

  function shiftMonth(delta) {
    setViewDate((d) => { const nd = new Date(d); nd.setMonth(nd.getMonth() + delta); return nd; });
  }

  const others = (bookings || []).filter((_, i) => i !== editingIdx);

  return e('div', { className: 'rental-calendar' },
    e('div', { className: 'rental-calendar-head' },
      e('button', { type: 'button', className: 'btn ghost xs', onClick: () => shiftMonth(-1), 'aria-label': 'Mes anterior' }, e(Icons.ChevronLeft, { width: 13, height: 13 })),
      e('span', null, `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`),
      e('button', { type: 'button', className: 'btn ghost xs', onClick: () => shiftMonth(1), 'aria-label': 'Mes siguiente' }, e(Icons.Chevron, { width: 13, height: 13 })),
    ),
    e('div', { className: 'rental-calendar-grid' },
      WEEKDAYS.map((w, i) => e('div', { key: `w${i}`, className: 'rental-calendar-weekday' }, w)),
      cells.map((date, i) => {
        if (!date) return e('div', { key: i, className: 'rental-calendar-cell empty' });
        // Medio día: la mañana del día de salida y la tarde del día de entrada de otra reserva
        // quedan libres, para poder cargar un recambio en el mismo día
        const iso = toISODate(date);
        const prev = new Date(date); prev.setDate(prev.getDate() - 1);
        const night = others.some((b) => nightBooked(iso, b));
        const morning = others.some((b) => nightBooked(toISODate(prev), b));
        const state = night && morning ? 'booked' : night ? 'checkin' : morning ? 'checkout' : 'free';
        // El día en que entra otra reserva solo sirve como salida de la que se está eligiendo
        const pickingEnd = Boolean(selectedRange?.start && !selectedRange.end && date > selectedRange.start);
        const clickable = state === 'free' || state === 'checkout' || (state === 'checkin' && pickingEnd);
        const selected = state !== 'booked' && isInRange(date, selectedRange);
        const cls = selected ? `selected ${state}` : clickable ? `${state} clickable` : state;
        const title = state === 'checkin' ? 'Ese día entra otra reserva (sirve como día de salida)'
          : state === 'checkout' ? 'Ese día sale otra reserva (sirve como día de entrada)' : undefined;
        return e('div', {
          key: i, className: `rental-calendar-cell ${cls}`, title,
          onClick: () => (clickable || selected) && onDayClick && onDayClick(date),
        }, date.getDate());
      }),
    ),
    e('div', { className: 'rental-calendar-legend' },
      e('span', null, e('i', { className: 'dot free' }), 'Disponible'),
      e('span', null, e('i', { className: 'dot selected' }), editingIdx != null ? 'Editando' : 'Seleccionado'),
      e('span', null, e('i', { className: 'dot booked' }), 'Ocupado'),
      e('span', null, e('i', { className: 'dot half' }), 'Entrada / salida'),
    ),
  );
}

function BookingForm({ range, form, setForm, editing, error, saving, onChangeStart, onChangeEnd, onSubmit, onCancel }) {
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  const startVal = toISODate(range?.start);
  const endVal = toISODate(range?.end || range?.start);
  const nights = startVal ? nightsBetween(startVal, endVal) : 0;

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!startVal || saving) return;
    onSubmit();
  }

  return e('form', { className: `booking-form${editing ? ' editing' : ''}`, onSubmit: handleSubmit },
    e('div', { className: 'booking-form-title' },
      editing ? e(Icons.Edit, { width: 13, height: 13 }) : e(Icons.Plus, { width: 13, height: 13 }),
      editing ? 'Editar reserva' : 'Nueva reserva',
      nights > 0 && e('span', { className: 'booking-form-nights' }, `${nights} ${nights === 1 ? 'noche' : 'noches'}`),
    ),
    !startVal && e('div', { className: 'booking-form-hint' }, e(Icons.Calendar, { width: 12, height: 12 }), 'Elegí las fechas haciendo click en el calendario, o cargalas a mano'),
    startVal && !range?.end && !editing && e('div', { className: 'booking-form-hint' }, e(Icons.LogOut, { width: 12, height: 12 }), `Entrada el ${formatDay(startVal)}. Ahora elegí la fecha de salida en el calendario`),
    e('div', { className: 'form-row' },
      e('div', { className: 'field' }, e('label', null, 'Desde'), e('input', { type: 'date', value: startVal, onChange: (ev) => onChangeStart(fromISODate(ev.target.value)), required: true })),
      e('div', { className: 'field' }, e('label', null, 'Hasta'), e('input', { type: 'date', value: endVal, min: startVal || undefined, onChange: (ev) => onChangeEnd(fromISODate(ev.target.value)), required: true })),
    ),
    e('div', { className: 'form-row' },
      e('div', { className: 'field' }, e('label', null, 'Huésped'), e('input', { value: form.guestName, onChange: set('guestName'), placeholder: 'Nombre' })),
      e('div', { className: 'field' }, e('label', null, 'Teléfono'), e('input', { value: form.guestPhone, onChange: set('guestPhone'), placeholder: '+54 9 11...' })),
    ),
    e('div', { className: 'field' },
      e('label', null, 'Estado'),
      e('div', { className: 'booking-status-toggle' },
        [['reservado', 'Reservado'], ['bloqueado', 'Bloqueado']].map(([val, label]) => e('button', {
          key: val, type: 'button',
          className: `booking-status-opt ${val}${form.status === val ? ' on' : ''}`,
          onClick: () => setForm((f) => ({ ...f, status: val })),
        }, label)),
      ),
    ),
    e('div', { className: 'field' }, e('label', null, 'Notas'), e('input', { value: form.notes, onChange: set('notes'), placeholder: 'Notas de la reserva' })),
    error && e('div', { className: 'booking-form-error' }, e(Icons.AlertTriangle, { width: 13, height: 13 }), error),
    e('div', { className: 'booking-form-actions' },
      editing && e('button', { type: 'button', className: 'btn ghost sm', onClick: onCancel, disabled: saving }, 'Cancelar'),
      e('button', { type: 'submit', className: 'btn primary sm', disabled: !startVal || saving },
        editing ? e(Icons.Check, { width: 13, height: 13 }) : e(Icons.Plus, { width: 13, height: 13 }),
        saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar reserva'),
    ),
  );
}

function ReservationSection({ property, saveBookings, initialEditId, initialRange, onReceipt }) {
  const rental = property.temporaryRental || {};
  const bookings = rental.bookings || [];
  const initialIdx = initialEditId ? bookings.findIndex((b) => b._id === initialEditId) : -1;

  const [editingIdx, setEditingIdx] = useState(initialIdx >= 0 ? initialIdx : null);
  const [range, setRange] = useState(() => {
    if (initialIdx >= 0) return { start: parseDateOnly(bookings[initialIdx].startDate), end: parseDateOnly(bookings[initialIdx].endDate) };
    // Reserva nueva desde el calendario: viene con la entrada (y a veces la salida) ya elegida
    if (initialRange?.start) return { start: parseDateOnly(initialRange.start), end: parseDateOnly(initialRange.end) };
    return { start: null, end: null };
  });
  const [form, setForm] = useState(() => (initialIdx >= 0 ? pickForm(bookings[initialIdx]) : EMPTY_BOOKING_FORM));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const formRef = useRef(null);

  function pickForm(b) {
    return { guestName: b.guestName || '', guestPhone: b.guestPhone || '', notes: b.notes || '', status: b.status || 'reservado' };
  }

  function resetForm() {
    setEditingIdx(null);
    setRange({ start: null, end: null });
    setForm(EMPTY_BOOKING_FORM);
    setError('');
  }

  function startEdit(idx) {
    const b = bookings[idx];
    setEditingIdx(idx);
    setRange({ start: parseDateOnly(b.startDate), end: parseDateOnly(b.endDate) });
    setForm(pickForm(b));
    setError('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleDayClick(date) {
    setError('');
    setRange((r) => {
      if (!r.start || r.end) return { start: date, end: null };
      return date < r.start ? { start: date, end: r.start } : { start: r.start, end: date };
    });
  }

  async function handleSubmit() {
    if (!range.start) return;
    let startIso = toISODate(range.start), endIso = toISODate(range.end || range.start);
    if (endIso < startIso) [startIso, endIso] = [endIso, startIso];

    const clash = findOverlap(bookings, startIso, endIso, editingIdx);
    if (clash) {
      setError(`Se superpone con ${clash.guestName ? `la reserva de ${clash.guestName}` : 'otra reserva'} (${formatDay(clash.startDate)} → ${formatDay(clash.endDate)}).`);
      return;
    }

    const booking = { ...(editingIdx != null ? bookings[editingIdx] : {}), ...form, startDate: startIso, endDate: endIso };
    const next = editingIdx != null
      ? bookings.map((b, i) => (i === editingIdx ? booking : b))
      : [...bookings, booking];

    setSaving(true);
    setError('');
    try {
      await saveBookings(next);
      resetForm();
    } catch (err) {
      console.error(err);
      setError('No se pudo guardar la reserva. Probá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const idx = confirmIdx;
    await saveBookings(bookings.filter((_, i) => i !== idx));
    setConfirmIdx(null);
    if (editingIdx === idx) resetForm();
    else if (editingIdx != null && editingIdx > idx) setEditingIdx(editingIdx - 1);
  }

  // Ordenadas por fecha; las finalizadas quedan colapsadas abajo
  const ordered = bookings.map((b, i) => ({ b, i })).sort((x, y) => String(x.b.startDate).localeCompare(String(y.b.startDate)));
  const upcoming = ordered.filter(({ b }) => bookingTiming(b)?.key !== 'past');
  const past = ordered.filter(({ b }) => bookingTiming(b)?.key === 'past');

  function renderItem({ b, i }) {
    const timing = bookingTiming(b);
    const nights = nightsBetween(b.startDate, b.endDate);
    const wa = whatsappHref(b.guestPhone);
    return e('div', { key: bookingKey(b, i), className: `booking-item${editingIdx === i ? ' editing' : ''}${timing?.key === 'past' ? ' past' : ''}` },
      e('div', { className: 'booking-item-main' },
        e('span', { className: `status-badge badge-${b.status === 'bloqueado' ? 'vendida' : 'reservada'}` }, b.status === 'bloqueado' ? 'Bloqueado' : 'Reservado'),
        e('span', { className: 'booking-item-dates' }, e(Icons.Calendar, { width: 12, height: 12 }), `${formatDay(b.startDate)} → ${formatDay(b.endDate)}`),
        nights > 0 && e('span', { className: 'booking-item-nights' }, `${nights} ${nights === 1 ? 'noche' : 'noches'}`),
        timing && timing.key !== 'past' && e('span', { className: `booking-timing ${timing.key}` }, timing.label),
        e('div', { className: 'booking-item-actions' },
          e('button', { type: 'button', className: 'icon-btn', title: 'Recibo de reserva', 'aria-label': 'Recibo de reserva', onClick: () => onReceipt(b) }, e(Icons.FileText, { width: 13, height: 13 })),
          e('button', { type: 'button', className: 'icon-btn', title: 'Editar reserva', 'aria-label': 'Editar reserva', onClick: () => startEdit(i) }, e(Icons.Edit, { width: 13, height: 13 })),
          e('button', { type: 'button', className: 'icon-btn danger', title: 'Eliminar reserva', 'aria-label': 'Eliminar reserva', onClick: () => setConfirmIdx(i) }, e(Icons.Trash, { width: 13, height: 13 })),
        ),
      ),
      (b.guestName || b.guestPhone) && e('div', { className: 'booking-item-contact' },
        b.guestName && e('span', null, e(Icons.User, { width: 12, height: 12 }), b.guestName),
        b.guestPhone && (wa
          ? e('a', { href: wa, target: '_blank', rel: 'noopener noreferrer', className: 'booking-wa', title: 'Escribir por WhatsApp' }, e(Icons.WhatsApp, { width: 12, height: 12 }), b.guestPhone)
          : e('span', null, e(Icons.Phone, { width: 12, height: 12 }), b.guestPhone)),
      ),
      b.notes && e('div', { className: 'booking-item-notes' }, e(Icons.FileText, { width: 12, height: 12 }), b.notes),
    );
  }

  return e('div', { className: 'rental-avail' },
    e('div', { className: 'rental-avail-grid' },
      e('div', { className: 'rental-avail-calendar' }, e(AvailabilityCalendar, { bookings, selectedRange: range, onDayClick: handleDayClick, editingIdx })),
      e('div', { className: 'rental-avail-form', ref: formRef }, e(BookingForm, {
        range, form, setForm, editing: editingIdx != null, error, saving,
        onChangeStart: (d) => { setError(''); setRange((r) => ({ ...r, start: d })); },
        onChangeEnd: (d) => { setError(''); setRange((r) => ({ ...r, end: d })); },
        onSubmit: handleSubmit,
        onCancel: resetForm,
      })),
    ),

    e('div', { className: 'booking-list-head' },
      e('span', null, 'Reservas cargadas'),
      e('span', { className: 'booking-list-count' }, upcoming.length),
    ),
    upcoming.length === 0
      ? e('div', { className: 'booking-empty' }, e(Icons.Calendar, { width: 18, height: 18 }), 'No hay reservas próximas para esta propiedad')
      : e('div', { className: 'booking-list' }, upcoming.map(renderItem)),

    past.length > 0 && e('button', { type: 'button', className: 'booking-past-toggle', onClick: () => setShowPast((v) => !v) },
      e(showPast ? Icons.ChevronUp : Icons.ChevronDown, { width: 13, height: 13 }),
      showPast ? 'Ocultar finalizadas' : `Ver ${past.length} ${past.length === 1 ? 'reserva finalizada' : 'reservas finalizadas'}`),
    showPast && e('div', { className: 'booking-list' }, past.map(renderItem)),

    confirmIdx != null && bookings[confirmIdx] && e(ConfirmDialog, {
      title: '¿Estás seguro de que querés eliminar esta reserva?',
      onConfirm: confirmDelete,
      onCancel: () => setConfirmIdx(null),
    },
      e(BookingSummary, { booking: bookings[confirmIdx] }),
      e('p', { className: 'confirm-note' }, 'Las fechas van a quedar libres en el calendario (también en la web). Esta acción no se puede deshacer.'),
    ),
  );
}

function MonthRateCard({ title, rate, path, defaultCurrency, onSaveField }) {
  const r = rate || {};
  return e('div', { className: 'season-card' },
    e('div', { className: 'season-card-head' },
      e('span', { className: 'season-card-title' }, title),
      e('span', { className: 'season-card-currency' }, r.currency || defaultCurrency),
    ),
    e('div', { className: 'season-card-stats' },
      ['quincena', 'semana', 'dia'].map((k) => e('div', { key: k, className: 'season-stat' },
        e('div', { className: 'season-stat-label' }, k === 'dia' ? 'Día' : k[0].toUpperCase() + k.slice(1)),
        e('div', { className: 'season-stat-value' }, e(EditableField, {
          value: r[k], type: 'number', placeholder: '—',
          onSave: (v) => onSaveField(`${path}.${k}`, v),
        })),
      )),
    ),
  );
}

function InviernoCard({ rate, onSaveField }) {
  const r = rate || {};
  return e('div', { className: 'season-card' },
    e('div', { className: 'season-card-head' },
      e('span', { className: 'season-card-title' }, 'Invierno'),
      e('span', { className: 'season-card-currency' }, r.currency || 'ARS'),
    ),
    e('div', { className: 'season-card-stats single' },
      e('div', { className: 'season-stat' },
        e('div', { className: 'season-stat-label' }, 'Precio'),
        e('div', { className: 'season-stat-value' }, e(EditableField, {
          value: r.price, type: 'number', placeholder: '—',
          onSave: (v) => onSaveField('temporaryRental.seasonalRates.invierno.price', v),
        })),
      ),
    ),
  );
}

function TemporaryRentalModal({ property: initialProperty, initialTab = 'tarifas', initialEditId, initialRange, session, onChanged, onClose }) {
  const [property, setProperty] = useState(initialProperty);
  const [receiptFor, setReceiptFor] = useState(null);
  const [innerTab, setInnerTab] = useState(initialTab);
  const [heroIdx, setHeroIdx] = useState(0);
  const rental = property.temporaryRental || {};
  const rates = rental.seasonalRates || {};
  const photos = (property.photos || []).slice(0, 8);
  const price = formatPrice(property.operations);
  const capacity = capacityInfo(property);
  const upcomingCount = (rental.bookings || []).filter((b) => bookingTiming(b)?.key !== 'past').length;

  // Escape cierra el modal, salvo que se esté editando un campo (Escape cancela esa edición)
  // o que haya un diálogo de confirmación arriba (lo cierra él)
  const closeOnEscape = useCallback((ev) => {
    if (ev.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!document.querySelector('.confirm-overlay, .recibo-overlay')) onClose();
  }, [onClose]);
  useEscape(closeOnEscape);

  async function saveFields(fields) {
    const updated = await updateProperty(property.id, fields);
    setProperty(updated);
    onChanged?.(updated);
  }

  const saveField = (path, value) => saveFields({ [path]: value });

  function toggle(field) {
    saveField(`temporaryRental.${field}`, !rental[field]);
  }

  // Al cargar la capacidad exacta, el grupo (lo que usan los filtros) se completa solo
  function saveCapacity(value) {
    const nums = capacityNumbers(value);
    const group = capacityGroupFor(nums.length ? Math.max(...nums) : null);
    return saveFields(group ? { 'temporaryRental.capacity': value, 'temporaryRental.capacityGroup': group } : { 'temporaryRental.capacity': value });
  }

  const saveBookings = (bookings) => saveField('temporaryRental.bookings', bookings);

  const heroPhoto = photos[heroIdx] || photos[0];
  const heroSrc = heroPhoto ? photoSrc(heroPhoto) : null;

  return e('div', { className: 'prop-modal-overlay', onClick: onClose },
    e('div', { className: 'prop-modal rental-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'prop-modal-head' },
        e('h2', null, e(EditableField, {
          value: property.publication_title,
          placeholder: property.address || 'Alquiler temporario',
          onSave: (v) => saveField('publication_title', v),
        })),
        e('div', { className: 'modal-head-actions' },
          e('span', { className: `status-badge badge-${property.status}` }, STATUS_LABELS[property.status] || property.status),
          e('a', {
            className: 'btn ghost sm', href: `/propiedades/${property.id}`, target: '_blank', rel: 'noopener noreferrer',
            title: 'Abrir la ficha completa en una pestaña nueva',
          }, 'Ir a la propiedad', e(Icons.ArrowRight, { width: 13, height: 13 })),
        ),
        e('button', { className: 'btn ghost sm modal-close', onClick: onClose, 'aria-label': 'Cerrar' }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('div', { className: 'prop-modal-body rental-modal-body' },
        e('div', { className: 'rental-modal-grid' },

          e('div', { className: 'rental-modal-side' },
            heroSrc && e('div', { className: 'rental-hero-wrap' },
              e('div', { className: 'rental-hero-img' },
                e('img', { src: heroSrc, alt: 'Foto principal', loading: 'lazy' }),
                capacity && e('span', { className: 'capacity-pill on-photo' }, e(Icons.Users, { width: 12, height: 12 }), capacity.short),
              ),
              photos.length > 1 && e('div', { className: 'rental-hero-thumbs' },
                photos.map((p, i) => {
                  const src = photoSrc(p);
                  return src ? e('img', {
                    key: i, src, alt: `Foto ${i + 1}`, loading: 'lazy',
                    className: `rental-thumb${i === heroIdx ? ' active' : ''}`,
                    onClick: () => setHeroIdx(i),
                  }) : null;
                }),
              ),
            ),

            e('div', { className: 'rental-facts' },
              e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Dirección'), e('span', { className: 'rental-fact-value' }, property.address || '—')),
              price && e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Precio Tokko'), e('span', { className: 'rental-fact-value' }, price)),
              e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Localidad'), e('span', { className: 'rental-fact-value' }, e(EditableField, { value: rental.localidad, onSave: (v) => saveField('temporaryRental.localidad', v) }))),
              e('div', { className: 'rental-fact highlight' },
                e('span', { className: 'rental-fact-label' }, e(Icons.Users, { width: 13, height: 13 }), 'Capacidad'),
                e('span', { className: 'rental-fact-value' }, e(EditableField, {
                  value: rental.capacity, placeholder: 'Ej: 6 personas', onSave: saveCapacity,
                  formatDisplay: (v) => (!v ? 'Ej: 6 personas' : capacityNumbers(v).length && !/pers/i.test(v) ? `${v} personas` : v),
                })),
              ),
              e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Grupo'),
                e('select', {
                  className: 'rental-fact-select', title: 'Se usa para filtrar por capacidad. Se completa solo al cargar la capacidad.',
                  value: rental.capacityGroup || '', onChange: (ev) => saveField('temporaryRental.capacityGroup', ev.target.value || null),
                },
                  e('option', { value: '' }, '—'),
                  e('option', { value: '1-4' }, '1 a 4 personas'),
                  e('option', { value: '5-7' }, '5 a 7 personas'),
                  e('option', { value: '8-12' }, '8 a 12 personas'),
                ),
              ),
              property.room_amount > 0 && e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Ambientes'), e('span', { className: 'rental-fact-value' }, property.room_amount)),
              property.bathroom_amount > 0 && e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Baños'), e('span', { className: 'rental-fact-value' }, property.bathroom_amount)),
              e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Dist. al mar'), e('span', { className: 'rental-fact-value' }, e(EditableField, { value: rental.distMar, onSave: (v) => saveField('temporaryRental.distMar', v) }))),
              e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Dist. al centro'), e('span', { className: 'rental-fact-value' }, e(EditableField, { value: rental.distCentro, onSave: (v) => saveField('temporaryRental.distCentro', v) }))),
            ),

            e('div', { className: 'rental-toggles' },
              Object.keys(AMENITY_LABELS).map((field) =>
                e('button', {
                  key: field, type: 'button',
                  className: `st-chip${rental[field] ? ' on disponible' : ''}`,
                  onClick: () => toggle(field),
                }, AMENITY_LABELS[field]),
              ),
            ),
          ),

          e('div', { className: 'rental-modal-main' },
            e('div', { className: 'rental-ops-bar' },
              e('div', { className: 'rental-ops-item' },
                e('span', { className: 'rental-ops-label' }, 'Clave de alarma'),
                e(EditableField, { value: rental.alarmCode, onSave: (v) => saveField('temporaryRental.alarmCode', v) }),
              ),
              e('div', { className: 'rental-ops-item' },
                e('span', { className: 'rental-ops-label' }, 'Teléfono del dueño'),
                e(EditableField, { value: rental.ownerPhone, onSave: (v) => saveField('temporaryRental.ownerPhone', v) }),
              ),
            ),

            e('div', { className: 'modal-tabbar' },
              e('button', { type: 'button', className: `modal-tab${innerTab === 'tarifas' ? ' active' : ''}`, onClick: () => setInnerTab('tarifas') }, 'Tarifas de temporada'),
              e('button', { type: 'button', className: `modal-tab${innerTab === 'reserva' ? ' active' : ''}`, onClick: () => setInnerTab('reserva') },
                'Reservas', upcomingCount > 0 && e('span', { className: 'modal-tab-count' }, upcomingCount)),
            ),

            innerTab === 'tarifas' && e('div', { className: 'season-grid' },
              e(InviernoCard, { rate: rates.invierno, onSaveField: saveField }),
              e(MonthRateCard, { title: 'Diciembre', rate: rates.diciembre, path: 'temporaryRental.seasonalRates.diciembre', defaultCurrency: 'ARS', onSaveField: saveField }),
              e(MonthRateCard, { title: 'Enero', rate: rates.enero, path: 'temporaryRental.seasonalRates.enero', defaultCurrency: 'USD', onSaveField: saveField }),
              e(MonthRateCard, { title: 'Febrero', rate: rates.febrero, path: 'temporaryRental.seasonalRates.febrero', defaultCurrency: 'USD', onSaveField: saveField }),
              e(MonthRateCard, { title: 'Marzo', rate: rates.marzo, path: 'temporaryRental.seasonalRates.marzo', defaultCurrency: 'USD', onSaveField: saveField }),
            ),

            innerTab === 'reserva' && e(ReservationSection, { property, saveBookings, initialEditId, initialRange, onReceipt: setReceiptFor }),
          ),
        ),
      ),
    ),
    receiptFor && e(ReciboReserva, { property, booking: receiptFor, session, onClose: () => setReceiptFor(null) }),
  );
}

function CapacityChips({ value, onChange }) {
  return e('div', { className: 'capacity-filter scroll-row', role: 'group', 'aria-label': 'Filtrar por capacidad de personas' },
    e('span', { className: 'capacity-filter-label' }, e(Icons.Users, { width: 14, height: 14 }), 'Personas'),
    e('div', { className: 'capacity-seg' },
      CAPACITY_OPTIONS.map((o) => e('button', {
        key: o.key || 'all', type: 'button',
        className: `capacity-seg-btn${value === o.key ? ' on' : ''}${o.key === 'none' ? ' muted' : ''}`,
        'aria-pressed': value === o.key,
        onClick: () => onChange(o.key),
      }, o.label)),
    ),
  );
}

function RentalCard({ property, onClick }) {
  const photo = property.photos?.[0];
  const src = photoSrc(photo);
  const price = formatPrice(property.operations);
  const teaser = seasonTeaser(property.temporaryRental);
  const capacity = capacityInfo(property);

  return e('div', { className: 'prop-card', onClick: () => onClick(property) },
    e('div', { className: 'prop-card-img' },
      src ? e('img', { src, alt: property.publication_title || property.address, loading: 'lazy' })
           : e('div', { className: 'prop-card-no-img' }, e(Icons.Building, { width: 32, height: 32 })),
      e('div', { className: 'prop-card-status' },
        e('span', { className: `status-badge badge-${property.status}` }, STATUS_LABELS[property.status] || property.status),
      ),
      e('span', { className: `capacity-pill on-photo${capacity ? '' : ' missing'}`, title: capacity ? 'Capacidad de personas' : 'Capacidad sin cargar' },
        e(Icons.Users, { width: 12, height: 12 }), capacity ? capacity.short : 'Sin capacidad'),
    ),
    e('div', { className: 'prop-card-body' },
      e('div', { className: 'prop-card-title' }, property.publication_title || property.address || 'Sin título'),
      e('div', { className: 'prop-card-location' }, e(Icons.MapPin, { width: 11, height: 11 }), property.temporaryRental?.localidad || property.location?.name || property.address || '—'),
      teaser ? e('div', { className: 'prop-card-price' }, teaser) : (price && e('div', { className: 'prop-card-price' }, price)),
    ),
  );
}

function FactCard({ property, onClick }) {
  const rental = property.temporaryRental || {};
  const capacity = capacityInfo(property);
  return e('div', { className: 'fact-card', onClick: () => onClick(property) },
    e('div', { className: 'fact-card-head' },
      e('div', { className: 'fact-card-title' }, property.publication_title || property.address || 'Sin título'),
      capacity && e('span', { className: 'fact-card-capacity' }, e(Icons.Users, { width: 11, height: 11 }), capacity.short),
    ),
    e('div', { className: 'fact-card-address' }, e(Icons.MapPin, { width: 11, height: 11 }), property.address || '—'),
    (property.room_amount > 0 || property.bathroom_amount > 0 || rental.distMar || rental.distCentro) && e('div', { className: 'fact-card-stats' },
      property.room_amount > 0 && e('span', null, `${property.room_amount} amb.`),
      property.bathroom_amount > 0 && e('span', null, `${property.bathroom_amount} baños`),
      rental.distMar && e('span', null, `${rental.distMar} al mar`),
      rental.distCentro && e('span', null, `${rental.distCentro} al centro`),
    ),
    e('div', { className: 'fact-card-amenities' },
      Object.keys(AMENITY_LABELS).map((key) => e('span', {
        key, className: `fact-amenity${rental[key] ? ' yes' : ' no'}`,
      }, AMENITY_LABELS[key])),
    ),
  );
}

function SearchBox({ value, onChange, onEnter, placeholder }) {
  return e('div', { className: 'search toolbar-search' },
    e(Icons.Search, { width: 15, height: 15 }),
    e('input', {
      placeholder, value,
      onChange: (ev) => onChange(ev.target.value),
      onKeyDown: (ev) => ev.key === 'Enter' && onEnter && onEnter(),
    }),
    value ? e('button', { className: 'search-clear', onClick: () => onChange(''), 'aria-label': 'Limpiar búsqueda' }, e(Icons.Close, { width: 13, height: 13 })) : null,
  );
}

function RentalGridPanel({ capacity, onCapacityChange, onSelect, refreshKey }) {
  const [properties, setProperties] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchProperties = useCallback(async (off = 0) => {
    setLoading(true);
    const params = { limit: LIMIT, offset: off, operation_type: 'Alquiler temporal' };
    if (search) params.searchQuery = search;
    if (capacity) params.capacityGroup = capacity;
    try {
      const data = await getProperties(params);
      setProperties(data?.objects || []);
      setTotal(data?.meta?.total_count || 0);
      setOffset(off);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, capacity]);

  useEffect(() => { fetchProperties(0); }, [fetchProperties, refreshKey]);

  const pages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;
  const capacityLabel = CAPACITY_OPTIONS.find((o) => o.key === capacity)?.label;

  return e('div', { className: 'rental-panel' },
    e('div', { className: 'prop-toolbar' },
      e('div', { className: 'prop-toolbar-top' },
        e('div', { className: 'prop-toolbar-left' },
          e('h1', null, 'Alquileres temporarios'),
          e('span', { className: 'prop-count-pill' }, `${total} propiedades`),
        ),
        e('div', { className: 'prop-toolbar-right' },
          e(SearchBox, { value: search, onChange: setSearch, onEnter: () => fetchProperties(), placeholder: 'Buscar por localidad, dirección…' }),
        ),
      ),
      e(CapacityChips, { value: capacity, onChange: onCapacityChange }),
    ),
    e('div', { className: 'prop-list-wrap' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando propiedades…')
        : properties.length === 0
          ? e('div', { className: 'prop-empty' }, e(Icons.Users, { width: 48, height: 48 }),
              e('p', null, capacity ? `No hay alquileres para ${capacity === 'none' ? 'mostrar sin capacidad definida' : `${capacityLabel} personas`}` : 'No hay propiedades en esta categoría'),
              capacity && e('button', { type: 'button', className: 'btn ghost sm', style: { marginTop: 12 }, onClick: () => onCapacityChange('') }, 'Ver todas'))
          : e('div', { className: 'prop-grid' }, properties.map((p) => e(RentalCard, { key: p.id, property: p, onClick: onSelect }))),
    ),

    pages > 1 && e('div', { className: 'prop-pagination' },
      e('button', { className: 'btn ghost sm', disabled: currentPage <= 1, onClick: () => fetchProperties((currentPage - 2) * LIMIT) }, e(Icons.ChevronLeft, { width: 14, height: 14 })),
      e('span', null, `Página ${currentPage} de ${pages}`),
      e('button', { className: 'btn ghost sm', disabled: currentPage >= pages, onClick: () => fetchProperties(currentPage * LIMIT) }, e(Icons.Chevron, { width: 14, height: 14 })),
    ),
  );
}

function FichaPropiedadesTab({ capacity, onCapacityChange, onSelect, refreshKey }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = { limit: 200, offset: 0, operation_type: 'Alquiler temporal' };
    if (search) params.searchQuery = search;
    if (capacity) params.capacityGroup = capacity;
    try {
      const data = await getProperties(params);
      setProperties(data?.objects || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, capacity]);

  useEffect(() => { fetchAll(); }, [fetchAll, refreshKey]);

  const groups = {};
  for (const p of properties) {
    const loc = p.temporaryRental?.localidad || 'Sin localidad';
    (groups[loc] || (groups[loc] = [])).push(p);
  }
  const localities = Object.keys(groups).sort();

  return e('div', { className: 'rental-panel' },
    e('div', { className: 'prop-toolbar' },
      e('div', { className: 'prop-toolbar-top' },
        e('div', { className: 'prop-toolbar-left' },
          e('h1', null, 'Ficha de propiedades'),
          e('span', { className: 'prop-count-pill' }, `${properties.length} propiedades`),
        ),
        e('div', { className: 'prop-toolbar-right' },
          e(SearchBox, { value: search, onChange: setSearch, onEnter: fetchAll, placeholder: 'Buscar por nombre, localidad…' }),
        ),
      ),
      e(CapacityChips, { value: capacity, onChange: onCapacityChange }),
    ),
    e('div', { className: 'prop-list-wrap' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando propiedades…')
        : properties.length === 0
          ? e('div', { className: 'prop-empty' }, e(Icons.Building, { width: 48, height: 48 }), e('p', null, 'No hay propiedades con estos filtros'))
          : localities.map((loc) => e('div', { key: loc, className: 'ficha-locality-group' },
              e('h2', { className: 'ficha-locality-title' }, loc),
              e('div', { className: 'ficha-grid' }, groups[loc].map((p) => e(FactCard, { key: p.id, property: p, onClick: onSelect }))),
            )),
    ),
  );
}

const RESERVA_VIEWS = [
  { key: 'upcoming', label: 'Próximas y en curso' },
  { key: 'past', label: 'Finalizadas' },
  { key: 'all', label: 'Todas' },
];

function StatTile({ icon, label, value, hint, tone }) {
  return e('div', { className: `res-stat ${tone || ''}` },
    e('div', { className: 'res-stat-icon' }, e(icon, { width: 16, height: 16 })),
    e('div', null,
      e('div', { className: 'res-stat-value' }, value),
      e('div', { className: 'res-stat-label' }, label),
      hint && e('div', { className: 'res-stat-hint' }, hint),
    ),
  );
}

function PropertyPickerDialog({ properties, subtitle, onPick, onClose }) {
  const [q, setQ] = useState('');
  useEscape(onClose);
  const list = properties.filter((p) => !q || normalizeSearch(`${propertyTitle(p)} ${p.address} ${p.temporaryRental?.localidad}`).includes(normalizeSearch(q)));

  return e('div', { className: 'confirm-overlay', onClick: onClose },
    e('div', { className: 'picker-dialog', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'picker-head' },
        e('h3', null, 'Nueva reserva'),
        e('p', null, subtitle || '¿Para qué propiedad es la reserva?'),
        e('div', { className: 'search picker-search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', { autoFocus: true, placeholder: 'Buscar propiedad…', value: q, onChange: (ev) => setQ(ev.target.value) }),
        ),
      ),
      e('div', { className: 'picker-list' },
        list.length === 0 && e('div', { className: 'booking-empty' }, 'No se encontraron propiedades'),
        list.map((p) => {
          const src = photoSrc(p.photos?.[0]);
          const cap = capacityInfo(p);
          return e('button', { key: p.id, type: 'button', className: 'picker-item', onClick: () => onPick(p) },
            src ? e('img', { src, alt: '', loading: 'lazy' }) : e('span', { className: 'picker-noimg' }, e(Icons.Building, { width: 16, height: 16 })),
            e('span', { className: 'picker-item-text' },
              e('span', { className: 'picker-item-title' }, propertyTitle(p)),
              e('span', { className: 'picker-item-sub' }, [p.temporaryRental?.localidad, cap?.short].filter(Boolean).join(' · ') || p.address || ''),
            ),
            e(Icons.Chevron, { width: 14, height: 14 }),
          );
        }),
      ),
    ),
  );
}

// Sub-navegación de la pestaña Reservas: la lista es la vista principal, el calendario la secundaria
const RESERVA_MODES = [
  { key: 'lista', label: 'Lista', icon: Icons.List },
  { key: 'calendario', label: 'Calendario', icon: Icons.Calendar },
];

function ReservasPanel({ onOpen, refreshKey, capacity, onCapacityChange, session }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('lista');
  const [view, setView] = useState('upcoming');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  // Fechas para buscar propiedades libres en el calendario
  const [freeRange, setFreeRange] = useState({ start: '', end: '' });
  const [toDelete, setToDelete] = useState(null);
  // null | { properties, range, subtitle } — lista de propiedades a elegir para una reserva nueva
  const [picking, setPicking] = useState(null);
  // Reserva abierta en la vista de detalle, y recibo en edición: { property, booking, idx? }
  const [detail, setDetail] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProperties({ limit: 500, offset: 0, operation_type: 'Alquiler temporal' });
      setProperties(data?.objects || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll, refreshKey]);

  const todayIso = toISODate(new Date());

  const all = useMemo(() => properties.flatMap((p) => (p.temporaryRental?.bookings || [])
    .map((b, idx) => ({ property: p, booking: b, idx }))
    .filter((r) => r.booking.startDate && r.booking.endDate)), [properties]);

  const stats = useMemo(() => {
    const in7 = toISODate(new Date(Date.now() + 7 * 86400000));
    const current = all.filter(({ booking: b }) => b.startDate.slice(0, 10) <= todayIso && b.endDate.slice(0, 10) >= todayIso);
    const busyIds = new Set(current.map((r) => r.property.id));
    return {
      current: current.length,
      checkins: all.filter(({ booking: b }) => b.startDate.slice(0, 10) > todayIso && b.startDate.slice(0, 10) <= in7).length,
      checkouts: all.filter(({ booking: b }) => b.endDate.slice(0, 10) >= todayIso && b.endDate.slice(0, 10) <= in7).length,
      free: properties.filter((p) => !busyIds.has(p.id)).length,
    };
  }, [all, properties, todayIso]);

  const rows = all
    .filter(({ booking: b }) => {
      const end = b.endDate.slice(0, 10);
      if (view === 'upcoming' && end < todayIso) return false;
      if (view === 'past' && end >= todayIso) return false;
      if (status && (b.status || 'reservado') !== status) return false;
      return true;
    })
    .filter(({ property: p, booking: b }) => !search
      || normalizeSearch(`${b.guestName} ${b.guestPhone} ${b.notes} ${propertyTitle(p)} ${p.address} ${p.temporaryRental?.localidad}`).includes(normalizeSearch(search)))
    .sort((x, y) => (view === 'past' ? -1 : 1) * x.booking.startDate.localeCompare(y.booking.startDate));

  // Agrupadas por mes de entrada para que se lea como una agenda
  const months = [];
  for (const r of rows) {
    const d = parseDateOnly(r.booking.startDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let g = months[months.length - 1];
    if (!g || g.key !== key) { g = { key, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`, rows: [] }; months.push(g); }
    g.rows.push(r);
  }

  async function confirmDelete() {
    const { property, idx } = toDelete;
    const next = (property.temporaryRental?.bookings || []).filter((_, i) => i !== idx);
    const updated = await updateProperty(property.id, { 'temporaryRental.bookings': next });
    setProperties((ps) => ps.map((p) => (p.id === property.id ? { ...p, temporaryRental: updated?.temporaryRental || { ...p.temporaryRental, bookings: next } } : p)));
    setToDelete(null);
    setDetail(null);
  }

  const hasFilters = Boolean(search || status || view !== 'upcoming');

  function renderRow({ property: p, booking: b, idx }) {
    const s = parseDateOnly(b.startDate);
    const nights = nightsBetween(b.startDate, b.endDate);
    const timing = bookingTiming(b);
    const cap = capacityInfo(p);
    const src = photoSrc(p.photos?.[0]);
    const wa = whatsappHref(b.guestPhone);
    const open = () => setDetail({ property: p, booking: b, idx });
    // Toda la tarjeta abre la vista de la reserva
    return e('div', {
      key: `${p.id}-${bookingKey(b, idx)}`, className: `res-row${timing?.key === 'past' ? ' past' : ''}${timing?.key === 'now' ? ' now' : ''}`,
      role: 'button', tabIndex: 0, 'aria-label': `Ver la reserva de ${b.guestName || propertyTitle(p)}, ${formatDay(b.startDate)} a ${formatDay(b.endDate)}`,
      onClick: open,
      onKeyDown: (ev) => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); open(); } },
    },
      e('div', { className: 'res-date' },
        e('span', { className: 'res-date-day' }, s.getDate()),
        e('span', { className: 'res-date-month' }, MONTH_SHORT[s.getMonth()]),
      ),
      e('div', { className: 'res-main' },
        e('div', { className: 'res-line' },
          e('span', { className: 'res-range' }, `${formatDay(b.startDate)} → ${formatDay(b.endDate)}`),
          nights > 0 && e('span', { className: 'booking-item-nights' }, `${nights} ${nights === 1 ? 'noche' : 'noches'}`),
          e('span', { className: `status-badge badge-${b.status === 'bloqueado' ? 'vendida' : 'reservada'}` }, b.status === 'bloqueado' ? 'Bloqueado' : 'Reservado'),
          timing && timing.key !== 'past' && e('span', { className: `booking-timing ${timing.key}` }, timing.label),
        ),
        e('div', { className: 'res-property' },
          src ? e('img', { src, alt: '', loading: 'lazy' }) : e('span', { className: 'picker-noimg' }, e(Icons.Building, { width: 12, height: 12 })),
          e('span', { className: 'res-property-title' }, propertyTitle(p)),
          p.temporaryRental?.localidad && e('span', { className: 'res-muted' }, `· ${p.temporaryRental.localidad}`),
          cap && e('span', { className: 'res-muted res-cap' }, e(Icons.Users, { width: 11, height: 11 }), cap.short),
        ),
        (b.guestName || b.guestPhone || b.notes) && e('div', { className: 'res-guest' },
          b.guestName && e('span', null, e(Icons.User, { width: 12, height: 12 }), b.guestName),
          b.guestPhone && (wa
            ? e('a', { href: wa, target: '_blank', rel: 'noopener noreferrer', className: 'booking-wa', title: 'Escribir por WhatsApp', onClick: (ev) => ev.stopPropagation() }, e(Icons.WhatsApp, { width: 12, height: 12 }), b.guestPhone)
            : e('span', null, e(Icons.Phone, { width: 12, height: 12 }), b.guestPhone)),
          b.notes && e('span', { className: 'res-notes' }, e(Icons.FileText, { width: 12, height: 12 }), b.notes),
        ),
      ),
      e('span', { className: 'res-open', 'aria-hidden': true }, e(Icons.Chevron, { width: 16, height: 16 })),
    );
  }

  const isCalendar = mode === 'calendario';
  const pickAny = () => setPicking({ properties });

  return e('div', { className: `rental-panel${isCalendar ? ' is-calendar' : ''}` },
    e('div', { className: 'prop-toolbar' },
      e('div', { className: 'prop-toolbar-top' },
        e('div', { className: 'prop-toolbar-left' },
          e('h1', null, 'Reservas'),
          e('div', { className: 'res-subnav', role: 'tablist', 'aria-label': 'Vista de reservas' },
            RESERVA_MODES.map((m) => e('button', {
              key: m.key, type: 'button', role: 'tab', 'aria-selected': mode === m.key,
              className: `res-subnav-btn${mode === m.key ? ' on' : ''}`, onClick: () => setMode(m.key),
            }, e(m.icon, { width: 14, height: 14 }), m.label)),
          ),
          !isCalendar && e('span', { className: 'prop-count-pill res-count' }, `${rows.length} ${rows.length === 1 ? 'reserva' : 'reservas'}`),
        ),
        e('div', { className: 'prop-toolbar-right' },
          e(SearchBox, { value: search, onChange: setSearch, placeholder: isCalendar ? 'Propiedad o huésped…' : 'Huésped, teléfono, propiedad…' }),
          e(FiltersButton, {
            open: filtersOpen, onToggle: () => setFiltersOpen((v) => !v),
            count: isCalendar ? Boolean(capacity) + Boolean(freeRange.start) : (view !== 'upcoming') + Boolean(status),
          }),
          e('button', { type: 'button', className: 'btn primary sm res-new', onClick: pickAny, disabled: properties.length === 0, 'aria-label': 'Nueva reserva', title: 'Nueva reserva' },
            e(Icons.Plus, { width: 13, height: 13 }), e('span', { className: 'btn-text' }, 'Nueva reserva')),
        ),
      ),
      // Las dos preguntas de una consulta: ¿para cuántas personas? ¿qué fechas?
      isCalendar && e('div', { className: `prop-toolbar-filters filters-collapsible${filtersOpen ? ' open' : ''}` },
        e(CapacityChips, { value: capacity, onChange: onCapacityChange }),
        e(AvailabilityFilter, { range: freeRange, onChange: setFreeRange }),
      ),
      !isCalendar && e('div', { className: `prop-toolbar-filters filters-collapsible${filtersOpen ? ' open' : ''}` },
        e('div', { className: 'capacity-seg' },
          RESERVA_VIEWS.map((v) => e('button', {
            key: v.key, type: 'button', className: `capacity-seg-btn${view === v.key ? ' on' : ''}`, 'aria-pressed': view === v.key, onClick: () => setView(v.key),
          }, v.label)),
        ),
        e('div', { className: 'status-chips' },
          [['', 'Todos los estados'], ['reservado', 'Reservado'], ['bloqueado', 'Bloqueado']].map(([val, label]) => e('button', {
            key: val || 'all', type: 'button',
            className: `st-chip${status === val ? ` on ${val === 'bloqueado' ? 'vendida' : val === 'reservado' ? 'reservada' : 'disponible'}` : ''}`,
            onClick: () => setStatus(val),
          }, label)),
        ),
      ),
    ),
    isCalendar && e('div', { className: 'res-cal-wrap' },
      loading && properties.length === 0
        ? e('div', { className: 'loading-state' }, 'Cargando reservas…')
        : e(ReservasCalendar, {
          properties, search, capacity, range: freeRange, onRangeChange: setFreeRange,
          onEdit: (p, b) => onOpen(p, { tab: 'reserva', editId: b._id }),
          onOpenProperty: (p) => onOpen(p, { tab: 'reserva' }),
          onNew: (p, range) => onOpen(p, { tab: 'reserva', range }),
          onNewOnDay: (iso, free) => setPicking({ properties: free, range: { start: iso }, subtitle: `Propiedades libres el ${formatDay(iso)} — elegí una para cargar la reserva` }),
          onDelete: (p, b, idx) => setToDelete({ property: p, booking: b, idx }),
          onReceipt: (p, b) => setReceipt({ property: p, booking: b }),
        }),
    ),
    !isCalendar && e('div', { className: 'prop-list-wrap' },
      e('div', { className: 'res-stats' },
        e(StatTile, { icon: Icons.Home, label: 'Ocupadas hoy', value: stats.current, tone: 'amber' }),
        e(StatTile, { icon: Icons.LogIn, label: 'Entradas próx. 7 días', value: stats.checkins, tone: 'green' }),
        e(StatTile, { icon: Icons.LogOut, label: 'Salidas próx. 7 días', value: stats.checkouts, tone: 'blue' }),
        e(StatTile, { icon: Icons.Check, label: 'Libres hoy', value: stats.free, hint: `de ${properties.length} propiedades` }),
      ),
      loading && properties.length === 0
        ? e('div', { className: 'loading-state' }, 'Cargando reservas…')
        : rows.length === 0
          ? e('div', { className: 'prop-empty' }, e(Icons.Calendar, { width: 48, height: 48 }),
              e('p', null, hasFilters ? 'No hay reservas con estos filtros' : 'No hay reservas próximas'),
              hasFilters
                ? e('button', { type: 'button', className: 'btn ghost sm', style: { marginTop: 12 }, onClick: () => { setSearch(''); setStatus(''); setView('upcoming'); } }, 'Limpiar filtros')
                : e('button', { type: 'button', className: 'btn primary sm', style: { marginTop: 12 }, onClick: pickAny }, e(Icons.Plus, { width: 13, height: 13 }), 'Cargar una reserva'))
          : months.map((g) => e('div', { key: g.key, className: 'res-month' },
              e('h2', { className: 'ficha-locality-title' }, g.label, e('span', { className: 'res-month-count' }, g.rows.length)),
              e('div', { className: 'res-list' }, g.rows.map(renderRow)),
            )),
    ),

    toDelete && e(ConfirmDialog, {
      title: '¿Estás seguro de que querés eliminar esta reserva?',
      onConfirm: confirmDelete,
      onCancel: () => setToDelete(null),
    },
      e(BookingSummary, { booking: toDelete.booking, property: toDelete.property }),
      e('p', { className: 'confirm-note' }, 'Las fechas van a quedar libres en el calendario (también en la web). Esta acción no se puede deshacer.'),
    ),

    detail && e(ReservaDetalle, {
      property: detail.property, booking: detail.booking,
      onClose: () => setDetail(null),
      onEdit: (p, b) => { setDetail(null); onOpen(p, { tab: 'reserva', editId: b._id }); },
      onOpenProperty: (p) => { setDetail(null); onOpen(p, { tab: 'reserva' }); },
      onDelete: (p, b) => setToDelete({ property: p, booking: b, idx: detail.idx }),
      onReceipt: (p, b) => setReceipt({ property: p, booking: b }),
    }),

    receipt && e(ReciboReserva, { property: receipt.property, booking: receipt.booking, session, onClose: () => setReceipt(null) }),

    picking && e(PropertyPickerDialog, {
      properties: picking.properties,
      subtitle: picking.subtitle,
      onClose: () => setPicking(null),
      onPick: (p) => { setPicking(null); onOpen(p, { tab: 'reserva', range: picking.range }); },
    }),
  );
}

export default function AlquileresTemporarios({ session }) {
  const [tab, setTab] = useState('propiedades');
  const [capacity, setCapacity] = useState('');
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const dirtyRef = useRef(false);

  async function openProperty(prop, opts = {}) {
    dirtyRef.current = false;
    let full = prop;
    try { full = (await getPropertyById(prop.id)) || prop; } catch { /* se usa la versión del listado */ }
    setSelected({ property: full, tab: opts.tab || 'tarifas', editId: opts.editId, range: opts.range });
  }

  // Al cerrar el modal, si hubo cambios, se refresca la pestaña de atrás (reservas, capacidad…)
  const closeModal = useCallback(() => {
    setSelected(null);
    if (dirtyRef.current) setRefreshKey((k) => k + 1);
  }, []);

  return e('div', { className: 'propiedades' },
    e('div', { className: 'rental-tabbar', role: 'tablist' },
      TABS.map((t) => e('button', {
        key: t.key, type: 'button', role: 'tab', 'aria-selected': tab === t.key,
        className: `rental-tab${tab === t.key ? ' active' : ''}`,
        onClick: () => setTab(t.key),
      }, e(t.icon, { width: 14, height: 14 }),
        e('span', { className: t.short ? 'tab-long' : undefined }, t.label),
        t.short && e('span', { className: 'tab-short' }, t.short))),
    ),

    tab === 'propiedades' && e(RentalGridPanel, { capacity, onCapacityChange: setCapacity, onSelect: openProperty, refreshKey }),
    tab === 'reservas' && e(ReservasPanel, { onOpen: openProperty, refreshKey, capacity, onCapacityChange: setCapacity, session }),
    tab === 'ficha' && e(FichaPropiedadesTab, { capacity, onCapacityChange: setCapacity, onSelect: openProperty, refreshKey }),

    selected && e(TemporaryRentalModal, {
      key: selected.property.id,
      property: selected.property,
      session,
      initialTab: selected.tab,
      initialEditId: selected.editId,
      initialRange: selected.range,
      onChanged: () => { dirtyRef.current = true; },
      onClose: closeModal,
    }),
  );
}
