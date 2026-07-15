'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import EditableField from '../UI/EditableField';
import { getProperties, getPropertyById, updateProperty } from '@/services/api';
import { photoSrc, formatPrice, STATUS_LABELS } from '@/lib/data';
import '../Propiedades/Propiedades.css';
import './AlquileresTemporarios.css';

const e = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const LIMIT = 20;

const TABS = [
  { key: 'vista', label: 'Vista general' },
  { key: '1-4', label: 'Capacidad 1-4' },
  { key: '5-7', label: 'Capacidad 5-7' },
  { key: '8-12', label: 'Capacidad 8-12' },
  { key: 'ficha', label: 'Ficha de propiedades' },
];

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

function dayInBooking(date, booking) {
  if (!booking.startDate || !booking.endDate) return false;
  const s = new Date(booking.startDate);
  const en = new Date(booking.endDate);
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return d0 >= new Date(s.getFullYear(), s.getMonth(), s.getDate()) && d0 <= new Date(en.getFullYear(), en.getMonth(), en.getDate());
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

function toISODate(d) {
  if (!d) return '';
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function AvailabilityCalendar({ bookings, selectedRange, onDayClick }) {
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const cells = buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth());

  function shiftMonth(delta) {
    setViewDate((d) => { const nd = new Date(d); nd.setMonth(nd.getMonth() + delta); return nd; });
  }

  return e('div', { className: 'rental-calendar' },
    e('div', { className: 'rental-calendar-head' },
      e('button', { type: 'button', className: 'btn ghost xs', onClick: () => shiftMonth(-1) }, e(Icons.ChevronLeft, { width: 13, height: 13 })),
      e('span', null, `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`),
      e('button', { type: 'button', className: 'btn ghost xs', onClick: () => shiftMonth(1) }, e(Icons.Chevron, { width: 13, height: 13 })),
    ),
    e('div', { className: 'rental-calendar-grid' },
      WEEKDAYS.map((w, i) => e('div', { key: `w${i}`, className: 'rental-calendar-weekday' }, w)),
      cells.map((date, i) => {
        if (!date) return e('div', { key: i, className: 'rental-calendar-cell empty' });
        const booked = (bookings || []).some((b) => dayInBooking(date, b));
        const selected = !booked && isInRange(date, selectedRange);
        const cls = booked ? 'booked' : selected ? 'selected' : 'free clickable';
        return e('div', {
          key: i, className: `rental-calendar-cell ${cls}`,
          onClick: () => !booked && onDayClick && onDayClick(date),
        }, date.getDate());
      }),
    ),
    e('div', { className: 'rental-calendar-legend' },
      e('span', null, e('i', { className: 'dot free' }), 'Disponible'),
      e('span', null, e('i', { className: 'dot selected' }), 'Seleccionado'),
      e('span', null, e('i', { className: 'dot booked' }), 'Ocupado'),
    ),
  );
}

function BookingForm({ range, onChangeStart, onChangeEnd, onAdd }) {
  const [form, setForm] = useState({ guestName: '', guestPhone: '', notes: '', status: 'reservado' });
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  const startVal = toISODate(range?.start);
  const endVal = toISODate(range?.end || range?.start);

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!startVal) return;
    onAdd(form);
    setForm({ guestName: '', guestPhone: '', notes: '', status: 'reservado' });
  }

  return e('form', { className: 'booking-form', onSubmit: handleSubmit },
    e('div', { className: 'booking-form-title' }, 'Nueva reserva'),
    !startVal && e('div', { className: 'booking-form-hint' }, e(Icons.MapPin, { width: 12, height: 12 }), 'Elegí las fechas haciendo click en el calendario, o cargalas a mano'),
    e('div', { className: 'form-row' },
      e('div', { className: 'field' }, e('label', null, 'Desde'), e('input', { type: 'date', value: startVal, onChange: (ev) => onChangeStart(fromISODate(ev.target.value)), required: true })),
      e('div', { className: 'field' }, e('label', null, 'Hasta'), e('input', { type: 'date', value: endVal, onChange: (ev) => onChangeEnd(fromISODate(ev.target.value)), required: true })),
    ),
    e('div', { className: 'form-row' },
      e('div', { className: 'field' }, e('label', null, 'Huésped'), e('input', { value: form.guestName, onChange: set('guestName'), placeholder: 'Nombre' })),
      e('div', { className: 'field' }, e('label', null, 'Teléfono'), e('input', { value: form.guestPhone, onChange: set('guestPhone'), placeholder: '+54 9 11...' })),
    ),
    e('div', { className: 'field' },
      e('label', null, 'Estado'),
      e('select', { value: form.status, onChange: set('status') },
        e('option', { value: 'reservado' }, 'Reservado'),
        e('option', { value: 'bloqueado' }, 'Bloqueado'),
      ),
    ),
    e('div', { className: 'field' }, e('label', null, 'Notas'), e('input', { value: form.notes, onChange: set('notes'), placeholder: 'Notas de la reserva' })),
    e('button', { type: 'submit', className: 'btn primary sm', disabled: !startVal }, e(Icons.Plus, { width: 13, height: 13 }), 'Agregar reserva'),
  );
}

function ReservationSection({ rental, addBooking, removeBooking }) {
  const [range, setRange] = useState({ start: null, end: null });

  function handleDayClick(date) {
    setRange((r) => {
      if (!r.start || r.end) return { start: date, end: null };
      return date < r.start ? { start: date, end: r.start } : { start: r.start, end: date };
    });
  }

  function handleAdd(extra) {
    if (!range.start) return;
    addBooking({ startDate: toISODate(range.start), endDate: toISODate(range.end || range.start), ...extra });
    setRange({ start: null, end: null });
  }

  return e('div', { className: 'rental-avail' },
    e('div', { className: 'rental-avail-grid' },
      e('div', { className: 'rental-avail-calendar' }, e(AvailabilityCalendar, { bookings: rental.bookings, selectedRange: range, onDayClick: handleDayClick })),
      e('div', { className: 'rental-avail-form' }, e(BookingForm, {
        range,
        onChangeStart: (d) => setRange((r) => ({ ...r, start: d })),
        onChangeEnd: (d) => setRange((r) => ({ ...r, end: d })),
        onAdd: handleAdd,
      })),
    ),
    e('div', { className: 'booking-list' },
      (rental.bookings || []).map((b, i) =>
        e('div', { key: i, className: 'booking-item' },
          e('span', { className: `status-badge badge-${b.status === 'bloqueado' ? 'vendida' : 'reservada'}` }, b.status === 'bloqueado' ? 'Bloqueado' : 'Reservado'),
          e('span', null, `${b.startDate?.slice(0, 10)} → ${b.endDate?.slice(0, 10)}`),
          b.guestName && e('span', null, b.guestName),
          b.guestPhone && e('span', null, b.guestPhone),
          e('button', { type: 'button', className: 'btn ghost xs danger', onClick: () => removeBooking(i) }, e(Icons.Trash, { width: 12, height: 12 })),
        ),
      ),
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

function TemporaryRentalModal({ property: initialProperty, onClose }) {
  const [property, setProperty] = useState(initialProperty);
  const [innerTab, setInnerTab] = useState('tarifas');
  const [heroIdx, setHeroIdx] = useState(0);
  const rental = property.temporaryRental || {};
  const rates = rental.seasonalRates || {};
  const photos = (property.photos || []).slice(0, 8);
  const price = formatPrice(property.operations);

  async function saveField(path, value) {
    const updated = await updateProperty(property.id, { [path]: value });
    setProperty(updated);
  }

  function toggle(field) {
    saveField(`temporaryRental.${field}`, !rental[field]);
  }

  function addBooking(booking) {
    const bookings = [...(rental.bookings || []), booking];
    saveField('temporaryRental.bookings', bookings);
  }

  function removeBooking(idx) {
    const bookings = (rental.bookings || []).filter((_, i) => i !== idx);
    saveField('temporaryRental.bookings', bookings);
  }

  const heroPhoto = photos[heroIdx] || photos[0];
  const heroSrc = heroPhoto ? photoSrc(heroPhoto) : null;

  return e('div', { className: 'prop-modal-overlay', onClick: onClose },
    e('div', { className: 'prop-modal rental-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'prop-modal-head' },
        e('h2', null, property.publication_title || property.address || 'Alquiler temporario'),
        e('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          e('span', { className: `status-badge badge-${property.status}` }, STATUS_LABELS[property.status] || property.status),
          e('button', { className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
        ),
      ),
      e('div', { className: 'prop-modal-body rental-modal-body' },
        e('div', { className: 'rental-modal-grid' },

          e('div', { className: 'rental-modal-side' },
            heroSrc && e('div', { className: 'rental-hero-wrap' },
              e('div', { className: 'rental-hero-img' }, e('img', { src: heroSrc, alt: 'Foto principal', loading: 'lazy' })),
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
              e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Capacidad'), e('span', { className: 'rental-fact-value' }, e(EditableField, { value: rental.capacity, onSave: (v) => saveField('temporaryRental.capacity', v) }))),
              e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Grupo'),
                e('select', {
                  className: 'rental-fact-select',
                  value: rental.capacityGroup || '', onChange: (ev) => saveField('temporaryRental.capacityGroup', ev.target.value || null),
                },
                  e('option', { value: '' }, '—'),
                  e('option', { value: '1-4' }, '1-4'),
                  e('option', { value: '5-7' }, '5-7'),
                  e('option', { value: '8-12' }, '8-12'),
                ),
              ),
              property.suite_amount > 0 && e('div', { className: 'rental-fact' }, e('span', { className: 'rental-fact-label' }, 'Ambientes'), e('span', { className: 'rental-fact-value' }, property.suite_amount)),
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
              e('button', { type: 'button', className: `modal-tab${innerTab === 'reserva' ? ' active' : ''}`, onClick: () => setInnerTab('reserva') }, 'Reserva'),
            ),

            innerTab === 'tarifas' && e('div', { className: 'season-grid' },
              e(InviernoCard, { rate: rates.invierno, onSaveField: saveField }),
              e(MonthRateCard, { title: 'Diciembre', rate: rates.diciembre, path: 'temporaryRental.seasonalRates.diciembre', defaultCurrency: 'ARS', onSaveField: saveField }),
              e(MonthRateCard, { title: 'Enero', rate: rates.enero, path: 'temporaryRental.seasonalRates.enero', defaultCurrency: 'USD', onSaveField: saveField }),
              e(MonthRateCard, { title: 'Febrero', rate: rates.febrero, path: 'temporaryRental.seasonalRates.febrero', defaultCurrency: 'USD', onSaveField: saveField }),
              e(MonthRateCard, { title: 'Marzo', rate: rates.marzo, path: 'temporaryRental.seasonalRates.marzo', defaultCurrency: 'USD', onSaveField: saveField }),
            ),

            innerTab === 'reserva' && e(ReservationSection, { rental, addBooking, removeBooking }),
          ),
        ),
      ),
    ),
  );
}

function RentalCard({ property, onClick }) {
  const photo = property.photos?.[0];
  const src = photoSrc(photo);
  const price = formatPrice(property.operations);
  const teaser = seasonTeaser(property.temporaryRental);

  return e('div', { className: 'prop-card', onClick: () => onClick(property) },
    e('div', { className: 'prop-card-img' },
      src ? e('img', { src, alt: property.publication_title || property.address, loading: 'lazy' })
           : e('div', { className: 'prop-card-no-img' }, e(Icons.Building, { width: 32, height: 32 })),
      e('div', { className: 'prop-card-status' },
        e('span', { className: `status-badge badge-${property.status}` }, STATUS_LABELS[property.status] || property.status),
      ),
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
  return e('div', { className: 'fact-card', onClick: () => onClick(property) },
    e('div', { className: 'fact-card-head' },
      e('div', { className: 'fact-card-title' }, property.publication_title || property.address || 'Sin título'),
      rental.capacity && e('span', { className: 'fact-card-capacity' }, rental.capacity),
    ),
    e('div', { className: 'fact-card-address' }, e(Icons.MapPin, { width: 11, height: 11 }), property.address || '—'),
    (property.suite_amount > 0 || property.bathroom_amount > 0 || rental.distMar || rental.distCentro) && e('div', { className: 'fact-card-stats' },
      property.suite_amount > 0 && e('span', null, `${property.suite_amount} amb.`),
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

function RentalGridPanel({ capacityGroup, title, onSelect }) {
  const [properties, setProperties] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    const params = { limit: LIMIT, offset: 0, operation_type: 'Alquiler temporal' };
    if (search) params.searchQuery = search;
    if (capacityGroup) params.capacityGroup = capacityGroup;
    try {
      const data = await getProperties(params);
      setProperties(data?.objects || []);
      setTotal(data?.meta?.total_count || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, capacityGroup]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  return e('div', { className: 'rental-panel' },
    e('div', { className: 'prop-toolbar' },
      e('div', { className: 'prop-toolbar-left' },
        e('h1', null, title || 'Alquileres temporarios'),
        e('span', { className: 'prop-count-pill' }, `${total} propiedades`),
      ),
      e('div', { className: 'prop-toolbar-right' },
        e('div', { className: 'search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', {
            ref: searchRef, placeholder: 'Buscar por localidad, dirección…', value: search,
            onChange: (ev) => setSearch(ev.target.value),
            onKeyDown: (ev) => ev.key === 'Enter' && fetchProperties(),
            style: { width: 220 },
          }),
          search ? e('button', { className: 'search-clear', onClick: () => setSearch('') }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
        e('button', { className: 'btn primary sm', onClick: () => fetchProperties() }, e(Icons.Search, { width: 13, height: 13 }), 'Buscar'),
      ),
    ),
    e('div', { className: 'prop-list-wrap' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando propiedades…')
        : properties.length === 0
          ? e('div', { className: 'prop-empty' }, e(Icons.Calendar, { width: 48, height: 48 }), e('p', null, 'No hay propiedades en esta categoría'))
          : e('div', { className: 'prop-grid' }, properties.map((p) => e(RentalCard, { key: p.id, property: p, onClick: onSelect }))),
    ),
  );
}

function FichaPropiedadesTab({ onSelect }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = { limit: 200, offset: 0, operation_type: 'Alquiler temporal' };
    if (search) params.searchQuery = search;
    try {
      const data = await getProperties(params);
      setProperties(data?.objects || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const groups = {};
  for (const p of properties) {
    const loc = p.temporaryRental?.localidad || 'Sin localidad';
    (groups[loc] || (groups[loc] = [])).push(p);
  }
  const localities = Object.keys(groups).sort();

  return e('div', { className: 'rental-panel' },
    e('div', { className: 'prop-toolbar' },
      e('div', { className: 'prop-toolbar-left' },
        e('h1', null, 'Ficha de propiedades'),
        e('span', { className: 'prop-count-pill' }, `${properties.length} propiedades`),
      ),
      e('div', { className: 'prop-toolbar-right' },
        e('div', { className: 'search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', {
            placeholder: 'Buscar por nombre, localidad…', value: search,
            onChange: (ev) => setSearch(ev.target.value),
            onKeyDown: (ev) => ev.key === 'Enter' && fetchAll(),
            style: { width: 220 },
          }),
          search ? e('button', { className: 'search-clear', onClick: () => setSearch('') }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
      ),
    ),
    e('div', { className: 'prop-list-wrap' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando propiedades…')
        : properties.length === 0
          ? e('div', { className: 'prop-empty' }, e(Icons.Building, { width: 48, height: 48 }), e('p', null, 'No hay propiedades cargadas'))
          : localities.map((loc) => e('div', { key: loc, className: 'ficha-locality-group' },
              e('h2', { className: 'ficha-locality-title' }, loc),
              e('div', { className: 'ficha-grid' }, groups[loc].map((p) => e(FactCard, { key: p.id, property: p, onClick: onSelect }))),
            )),
    ),
  );
}

export default function AlquileresTemporarios({ session }) {
  const [tab, setTab] = useState('vista');
  const [selected, setSelected] = useState(null);

  async function openProperty(prop) {
    try {
      const full = await getPropertyById(prop.id);
      setSelected(full || prop);
    } catch { setSelected(prop); }
  }

  return e('div', { className: 'propiedades' },
    e('div', { className: 'rental-tabbar' },
      TABS.map((t) => e('button', {
        key: t.key, type: 'button',
        className: `rental-tab${tab === t.key ? ' active' : ''}`,
        onClick: () => setTab(t.key),
      }, t.label)),
    ),

    tab === 'vista' && e(RentalGridPanel, { key: 'vista', capacityGroup: null, title: 'Alquileres temporarios', onSelect: openProperty }),
    tab === '1-4' && e(RentalGridPanel, { key: '1-4', capacityGroup: '1-4', title: 'Capacidad 1-4', onSelect: openProperty }),
    tab === '5-7' && e(RentalGridPanel, { key: '5-7', capacityGroup: '5-7', title: 'Capacidad 5-7', onSelect: openProperty }),
    tab === '8-12' && e(RentalGridPanel, { key: '8-12', capacityGroup: '8-12', title: 'Capacidad 8-12', onSelect: openProperty }),
    tab === 'ficha' && e(FichaPropiedadesTab, { key: 'ficha', onSelect: openProperty }),

    selected && e(TemporaryRentalModal, { property: selected, onClose: () => setSelected(null) }),
  );
}
