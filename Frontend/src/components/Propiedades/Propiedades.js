'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getProperties, getPropertyById, updatePropertyStatus, createProperty } from '@/services/api';
import './Propiedades.css';

const e = React.createElement;
const { useState, useEffect, useRef, useCallback } = React;

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:7003';

const STATUSES = [
  { key: 'all', label: 'Todas' },
  { key: 'disponible', label: 'Disponible', dot: '#15784f' },
  { key: 'reservada', label: 'Reservada', dot: '#b8791b' },
  { key: 'vendida', label: 'Vendida', dot: '#d8504a' },
  { key: 'en_tasacion', label: 'En tasación', dot: '#7257c9' },
  { key: 'no_disponible', label: 'No disponible', dot: '#8a978f' },
];

const OPERATION_TYPES = ['Todas', 'Venta', 'Alquiler'];
const PROPERTY_TYPES = ['Todos', 'Casa', 'Departamento', 'PH', 'Terreno', 'Local', 'Oficina'];
const CREATE_OPERATION_TYPES = ['Venta', 'Alquiler'];
const CREATE_PROPERTY_TYPES = ['Casa', 'Departamento', 'PH', 'Terreno', 'Local', 'Oficina'];
const STATUS_LABELS = { disponible: 'Disponible', reservada: 'Reservada', vendida: 'Vendida', en_tasacion: 'En tasación', no_disponible: 'No disponible' };

function formatPrice(ops) {
  if (!ops || !ops.length) return null;
  const op = ops[0];
  if (!op.prices || !op.prices.length) return null;
  const p = op.prices[0];
  if (!p.price) return null;
  const formatted = new Intl.NumberFormat('es-AR').format(p.price);
  return `${p.currency === 'USD' ? 'USD' : '$'} ${formatted}`;
}

function photoSrc(photo) {
  if (!photo) return null;
  if (photo.local_image) return photo.local_image.startsWith('http') ? photo.local_image : `${API_BASE}${photo.local_image}`;
  if (photo.image_url) return photo.image_url;
  if (photo.image) return photo.image;
  return null;
}

function PropCard({ property, onClick }) {
  const photo = property.photos?.[0];
  const src = photoSrc(photo);
  const price = formatPrice(property.operations);
  const opType = property.operations?.[0]?.operation_type;

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
      e('div', { className: 'prop-card-location' },
        e(Icons.MapPin, { width: 11, height: 11 }),
        property.location?.name || property.address || '—',
      ),
      price && e('div', { className: 'prop-card-price' }, `${opType ? `${opType} · ` : ''}${price}`),
      e('div', { className: 'prop-card-meta' },
        property.suite_amount > 0 && e('span', { className: 'prop-meta-item' }, e(Icons.Layers, { width: 12, height: 12 }), `${property.suite_amount} amb`),
        property.bathroom_amount > 0 && e('span', { className: 'prop-meta-item' }, '🚿 ', property.bathroom_amount),
        property.roofed_surface && e('span', { className: 'prop-meta-item' }, `${property.roofed_surface} m²`),
      ),
    ),
  );
}

function StatusSelect({ value, onChange }) {
  return e('select', { value, onChange: (ev) => onChange(ev.target.value), className: 'filter-select', style: { fontSize: 13 } },
    STATUSES.map((s) => e('option', { key: s.key, value: s.key }, s.label)),
  );
}

function PropModal({ property, onClose, session }) {
  const [status, setStatus] = useState(property.status);
  const [saving, setSaving] = useState(false);

  const photos = (property.photos || []).slice(0, 8);
  const price = formatPrice(property.operations);

  async function handleStatusChange(newStatus) {
    setSaving(true);
    try {
      await updatePropertyStatus(property.id, newStatus);
      setStatus(newStatus);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return e('div', { className: 'prop-modal-overlay', onClick: onClose },
    e('div', { className: 'prop-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'prop-modal-head' },
        e('h2', null, property.publication_title || property.address || 'Propiedad'),
        e('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          e('span', { className: `status-badge badge-${status}` }, STATUS_LABELS[status] || status),
          e('a', {
            className: 'btn ghost sm', href: `/propiedades/${property.id}`, target: '_blank', rel: 'noopener noreferrer',
            title: 'Abrir la ficha completa en una pestaña nueva',
          }, 'Ir a la propiedad', e(Icons.ArrowRight, { width: 13, height: 13 })),
          e('button', { className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
        ),
      ),
      e('div', { className: 'prop-modal-body' },
        photos.length > 0 && e('div', { className: 'prop-modal-photos' },
          photos.map((p, i) => {
            const src = photoSrc(p);
            return src ? e('img', { key: i, src, alt: `Foto ${i + 1}`, loading: 'lazy' }) : null;
          }),
        ),

        e('div', { className: 'prop-info-grid' },
          e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Dirección'), e('div', { className: 'prop-info-value' }, property.address || '—')),
          e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Barrio'), e('div', { className: 'prop-info-value' }, property.location?.name || '—')),
          price && e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Precio'), e('div', { className: 'prop-info-value' }, price)),
          property.roofed_surface && e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Superficie cubierta'), e('div', { className: 'prop-info-value' }, `${property.roofed_surface} m²`)),
          property.suite_amount > 0 && e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Ambientes'), e('div', { className: 'prop-info-value' }, property.suite_amount)),
          property.bathroom_amount > 0 && e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Baños'), e('div', { className: 'prop-info-value' }, property.bathroom_amount)),
          property.parking_lot_amount > 0 && e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Cocheras'), e('div', { className: 'prop-info-value' }, property.parking_lot_amount)),
          property.reference_code && e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Ref'), e('div', { className: 'prop-info-value' }, property.reference_code)),
        ),

        property.description && e('div', { className: 'prop-desc' }, property.description.slice(0, 400) + (property.description.length > 400 ? '…' : '')),

        e('div', { className: 'prop-status-section' },
          e('label', null, 'Cambiar estado'),
          e('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            STATUSES.filter((s) => s.key !== 'all').map((s) =>
              e('button', {
                key: s.key,
                className: `btn xs${status === s.key ? ' primary' : ' ghost'}`,
                onClick: () => handleStatusChange(s.key),
                disabled: saving || status === s.key,
              }, s.label)
            ),
          ),
        ),

        e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
          property.public_url && e('a', {
            href: property.public_url, target: '_blank', rel: 'noopener noreferrer',
            className: 'btn ghost sm',
          }, e(Icons.ExternalLink, { width: 13, height: 13 }), 'Ver en web'),
          e('button', { className: 'btn primary sm', onClick: onClose }, 'Cerrar'),
        ),
      ),
    ),
  );
}

function NewPropertyModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    address: '', publication_title: '', type_name: '', operation_type: '',
    currency: 'USD', price: '', location_name: '', room_amount: '', bathroom_amount: '', total_surface: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (ev) => setForm((f) => ({ ...f, [key]: ev.target.value }));

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.address.trim()) { setError('La dirección es obligatoria.'); return; }
    setSaving(true);
    setError('');
    try {
      const created = await createProperty(form);
      onCreated(created);
    } catch (err) {
      setError(err.message || 'No se pudo crear la propiedad.');
    } finally {
      setSaving(false);
    }
  }

  return e('div', { className: 'prop-modal-overlay', onClick: onClose },
    e('form', { className: 'prop-modal', onClick: (ev) => ev.stopPropagation(), onSubmit: handleSubmit },
      e('div', { className: 'prop-modal-head' },
        e('h2', null, 'Agregar propiedad'),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('div', { className: 'prop-modal-body' },
        e('p', { className: 'new-prop-hint' }, 'Cargá lo básico ahora — el resto de los datos (fotos, superficies, descripción, etc.) se completan después desde la ficha completa.'),

        e('div', { className: 'new-prop-grid' },
          e('div', { className: 'field', style: { gridColumn: '1 / -1' } },
            e('label', null, 'Dirección *'),
            e('input', { type: 'text', value: form.address, onChange: set('address'), placeholder: 'Calle y número', autoFocus: true }),
          ),
          e('div', { className: 'field', style: { gridColumn: '1 / -1' } },
            e('label', null, 'Título de publicación'),
            e('input', { type: 'text', value: form.publication_title, onChange: set('publication_title'), placeholder: 'Opcional' }),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Tipo'),
            e('select', { value: form.type_name, onChange: set('type_name') },
              e('option', { value: '' }, 'Sin especificar'),
              CREATE_PROPERTY_TYPES.map((t) => e('option', { key: t, value: t }, t)),
            ),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Barrio / zona'),
            e('input', { type: 'text', value: form.location_name, onChange: set('location_name') }),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Operación'),
            e('select', { value: form.operation_type, onChange: set('operation_type') },
              e('option', { value: '' }, 'Sin especificar'),
              CREATE_OPERATION_TYPES.map((t) => e('option', { key: t, value: t }, t)),
            ),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Precio'),
            e('div', { style: { display: 'flex', gap: 6 } },
              e('select', { value: form.currency, onChange: set('currency'), style: { width: 80 } },
                e('option', { value: 'USD' }, 'USD'), e('option', { value: 'ARS' }, 'ARS'),
              ),
              e('input', { type: 'number', value: form.price, onChange: set('price'), placeholder: '0' }),
            ),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Habitaciones'),
            e('input', { type: 'number', value: form.room_amount, onChange: set('room_amount') }),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Baños'),
            e('input', { type: 'number', value: form.bathroom_amount, onChange: set('bathroom_amount') }),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Superficie total (m²)'),
            e('input', { type: 'text', value: form.total_surface, onChange: set('total_surface') }),
          ),
        ),

        error && e('p', { className: 'error-msg' }, error),

        e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 } },
          e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, 'Cancelar'),
          e('button', { type: 'submit', className: 'btn primary sm', disabled: saving }, saving ? 'Creando…' : 'Crear propiedad'),
        ),
      ),
    ),
  );
}

const LIMIT = 20;

export default function Propiedades({ session }) {
  const [properties, setProperties] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [opFilter, setOpFilter] = useState('Todas');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const searchRef = useRef(null);

  const fetchProperties = useCallback(async (off = 0) => {
    setLoading(true);
    const params = { limit: LIMIT, offset: off, order: 'DESC', excludeOperationType: 'alquiler temporal' };
    if (search) params.searchQuery = search;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (opFilter !== 'Todas') params.operation_type = opFilter;
    if (typeFilter !== 'Todos') params.property_type = typeFilter;

    try {
      const data = await getProperties(params);
      setProperties(data?.objects || []);
      setTotal(data?.meta?.total_count || 0);
      setOffset(off);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, opFilter, typeFilter]);

  useEffect(() => { fetchProperties(0); }, [fetchProperties]);

  function handleSearchKeyDown(ev) {
    if (ev.key === 'Enter') fetchProperties(0);
  }

  async function handleCardClick(prop) {
    try {
      const full = await getPropertyById(prop.id);
      setSelected(full || prop);
    } catch {
      setSelected(prop);
    }
  }

  function handleCreated(property) {
    setShowCreate(false);
    fetchProperties(0);
    if (property?.id && typeof window !== 'undefined') window.open(`/propiedades/${property.id}`, '_blank', 'noopener');
  }

  const pages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return e('div', { className: 'propiedades' },

    // Toolbar
    e('div', { className: 'prop-toolbar' },
      e('div', { className: 'prop-toolbar-left' },
        e('h1', null, 'Propiedades'),
        e('span', { className: 'prop-count-pill' }, `${total} propiedades`),
      ),
      e('div', { className: 'prop-toolbar-right' },
        e('div', { className: 'search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', {
            ref: searchRef,
            placeholder: 'Buscar por dirección, tipo, ref…',
            value: search,
            onChange: (ev) => setSearch(ev.target.value),
            onKeyDown: handleSearchKeyDown,
            style: { width: 220 },
          }),
          search ? e('button', { className: 'search-clear', onClick: () => setSearch('') }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
        e('button', { className: 'btn primary sm', onClick: () => fetchProperties(0) }, e(Icons.Search, { width: 13, height: 13 }), 'Buscar'),
        e('button', { className: 'btn primary sm', onClick: () => setShowCreate(true) }, e(Icons.Plus, { width: 13, height: 13 }), 'Agregar propiedad'),
      ),
    ),

    // Status chips
    e('div', { className: 'status-chips' },
      STATUSES.map((s) =>
        e('button', {
          key: s.key,
          className: `st-chip${statusFilter === s.key ? ` on ${s.key}` : ''}`,
          onClick: () => setStatusFilter(s.key),
        },
          s.dot ? e('span', { className: 'st-chip-dot', style: { background: s.dot } }) : null,
          s.label,
        )
      ),
    ),

    // Filters
    e('div', { className: 'filters-bar' },
      e('select', { className: 'filter-select', value: opFilter, onChange: (ev) => setOpFilter(ev.target.value) },
        OPERATION_TYPES.map((t) => e('option', { key: t, value: t }, t)),
      ),
      e('select', { className: 'filter-select', value: typeFilter, onChange: (ev) => setTypeFilter(ev.target.value) },
        PROPERTY_TYPES.map((t) => e('option', { key: t, value: t }, t)),
      ),
    ),

    // List
    e('div', { className: 'prop-list-wrap' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando propiedades…')
        : properties.length === 0
          ? e('div', { className: 'prop-empty' }, e(Icons.Building, { width: 48, height: 48 }), e('p', null, 'No se encontraron propiedades'))
          : e('div', { className: 'prop-grid' },
              properties.map((p) => e(PropCard, { key: p.id, property: p, onClick: handleCardClick })),
            ),
    ),

    // Pagination
    pages > 1 && e('div', { className: 'prop-pagination' },
      e('button', { className: 'btn ghost sm', disabled: currentPage <= 1, onClick: () => fetchProperties((currentPage - 2) * LIMIT) }, e(Icons.ChevronLeft, { width: 14, height: 14 })),
      e('span', null, `Página ${currentPage} de ${pages}`),
      e('button', { className: 'btn ghost sm', disabled: currentPage >= pages, onClick: () => fetchProperties(currentPage * LIMIT) }, e(Icons.Chevron, { width: 14, height: 14 })),
    ),

    // Modal
    selected && e(PropModal, { property: selected, onClose: () => setSelected(null), session }),
    showCreate && e(NewPropertyModal, { onClose: () => setShowCreate(false), onCreated: handleCreated }),
  );
}
