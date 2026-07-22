'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import EditableField from '../UI/EditableField';
import PhotoManager from './PhotoManager';
import MlStats from './MlStats';
import PropertyMap from './PropertyMap';
import {
  updateProperty, updatePropertyStatus, updatePropertyDifusion, syncPropertyMercadoLibre,
  getMercadoLibreListingTypes, upgradeMercadoLibreListingType,
} from '@/services/api';
import { photoSrc, formatPrice, STATUS_LABELS, propertyWebUrl } from '@/lib/data';
import './Propiedades.css';
import './PropertyDetail.css';

const e = React.createElement;
const { useState, useEffect, useMemo } = React;

const PAGE_TABS = [
  { key: 'detalles', label: 'Detalles' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'mapa', label: 'Mapa' },
  { key: 'difusion', label: 'Difusión' },
  { key: 'estadisticas', label: 'Estadísticas' },
];

const DIFUSION_PLATFORMS = [
  { key: 'zonaprop', label: 'ZonaProp', accent: '#00b4f0' },
];

const ML_STATUS_LABELS = { active: 'Activo', paused: 'Pausado', closed: 'Cerrado' };
const ML_OPERATION_LABELS = { venta: 'Venta', alquiler: 'Alquiler' };

function Row({ label, icon, children }) {
  return e('div', { className: 'prop-info-item' },
    e('div', { className: 'prop-info-label' }, icon && e(icon, { width: 12, height: 12 }), label),
    e('div', { className: 'prop-info-value' }, children),
  );
}

function Section({ title, children }) {
  return e('div', { className: 'detail-section' },
    e('h3', null, title),
    e('div', { className: 'prop-info-grid' }, children),
  );
}

function GroupedSection({ title, groups }) {
  return e('div', { className: 'detail-section' },
    e('h3', null, title),
    groups.filter((g) => g.rows.some(Boolean)).map((g, i) =>
      e('div', { key: g.label || i, className: 'detail-subgroup' },
        g.label && e('h4', null, g.label),
        e('div', { className: 'prop-info-grid' }, g.rows),
      ),
    ),
  );
}

function normalizeTagText(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

const SERVICIOS_OPTIONS = [
  'Agua Corriente', 'Agua Potable', 'Alumbrado público', 'Biodigestores',
  'Cable', 'Cloaca', 'Electricidad', 'Energía trifásica',
  'Garagistas', 'Gas Envasado', 'Gas Natural', 'Instalación eléctrica subterránea',
  'Internet', 'Losa radiante general', 'Pavimento', 'Pozo negro',
  'Red de desagües pluviales', 'Teléfono', 'Televisión satelital', 'Wifi',
];

const AMBIENTES_OPTIONS = [
  'Altillo', 'Balcón', 'Balcón terraza', 'Baño de servicio',
  'Baulera', 'Biblioteca', 'Cocina', 'Cocina Americana',
  'Comedor diario', 'Departamento de Invitados', 'Escritorio', 'Galería',
  'Galpón', 'Jardín', 'Lavadero', 'Living comedor',
  'Oficina', 'Patio', 'Sala de juegos', 'Sala de reuniones',
  'Sótano', 'Terraza', 'Toilette', 'Vestidor',
];

const KNOWN_TAG_NAMES = new Set([...SERVICIOS_OPTIONS, ...AMBIENTES_OPTIONS].map(normalizeTagText));

// Checklist editable de "Servicios, ambientes y adicionales". A propósito NO lee/escribe
// `tags`/`custom_tags` (esos los pisa syncWithTokko.js cada 2 min) — usa `manual_tags`,
// un campo propio del CRM. La primera vez que se abre (manual_tags todavía no existe) arranca
// mostrando lo que ya vino sincronizado de Tokko como punto de partida, pero apenas se toca un
// checkbox pasa a guardarse en `manual_tags` y ese campo queda como única fuente de verdad.
function ServicesAmenitiesEditor({ property, saveField }) {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState('');

  const seeded = useMemo(() => {
    if (property.manual_tags) return property.manual_tags;
    return [...(property.tags || []), ...(property.custom_tags || [])].map((t) => t.name).filter(Boolean);
  }, [property.manual_tags, property.tags, property.custom_tags]);

  const checkedSet = useMemo(() => new Set(seeded.map(normalizeTagText)), [seeded]);

  const adicionalesOptions = useMemo(() => {
    const fromTokko = [...(property.tags || []), ...(property.custom_tags || [])]
      .filter((t) => t.name && !KNOWN_TAG_NAMES.has(normalizeTagText(t.name)))
      .map((t) => t.name);
    const fromManual = seeded.filter((n) => !KNOWN_TAG_NAMES.has(normalizeTagText(n)));
    return [...new Set([...fromTokko, ...fromManual])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  }, [property.tags, property.custom_tags, seeded]);

  async function toggle(name) {
    const key = normalizeTagText(name);
    const next = checkedSet.has(key) ? seeded.filter((n) => normalizeTagText(n) !== key) : [...seeded, name];
    setSaving(true);
    try { await saveField('manual_tags', next); }
    finally { setSaving(false); }
  }

  async function addExtra() {
    const name = extra.trim();
    if (!name || checkedSet.has(normalizeTagText(name))) { setExtra(''); return; }
    setExtra('');
    setSaving(true);
    try { await saveField('manual_tags', [...seeded, name]); }
    finally { setSaving(false); }
  }

  const q = normalizeTagText(search);
  const groups = [
    { key: 'Servicios', options: SERVICIOS_OPTIONS },
    { key: 'Ambientes', options: AMBIENTES_OPTIONS },
    { key: 'Adicionales', options: adicionalesOptions },
  ];

  return e('div', { className: 'services-editor' },
    e('div', { className: 'services-editor-search' },
      e(Icons.Search, { width: 15, height: 15 }),
      e('input', {
        placeholder: 'Buscar servicios, ambientes o adicionales', value: search,
        onChange: (ev) => setSearch(ev.target.value),
      }),
    ),
    groups.map(({ key, options }) => {
      const filtered = q ? options.filter((o) => normalizeTagText(o).includes(q)) : options;
      if (q && filtered.length === 0) return null;
      const showToggle = !q && filtered.length > 8;
      const expanded = !!q || !!expandedGroups[key] || !showToggle;
      const visible = expanded ? filtered : filtered.slice(0, 8);

      return e('div', { key, className: 'services-editor-group' },
        e('h4', null, key),
        options.length === 0
          ? e('div', { className: 'detail-empty-note' }, 'Sin adicionales cargados todavía.')
          : e('div', { className: 'services-editor-grid' },
              visible.map((name) => e('label', {
                key: name,
                className: `services-editor-item${checkedSet.has(normalizeTagText(name)) ? ' checked' : ''}`,
              },
                e('input', {
                  type: 'checkbox', checked: checkedSet.has(normalizeTagText(name)),
                  disabled: saving, onChange: () => toggle(name),
                }),
                e('span', null, name),
              )),
            ),
        key === 'Adicionales' && e('div', { className: 'services-editor-add' },
          e('input', {
            placeholder: 'Agregar otro adicional…', value: extra,
            onChange: (ev) => setExtra(ev.target.value),
            onKeyDown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addExtra(); } },
          }),
          e('button', { type: 'button', className: 'btn ghost xs', onClick: addExtra }, e(Icons.Plus, { width: 12, height: 12 }), 'Agregar'),
        ),
        showToggle && e('button', {
          type: 'button', className: 'services-editor-toggle',
          onClick: () => setExpandedGroups((c) => ({ ...c, [key]: !expanded })),
        }, expanded ? 'Ver menos' : 'Ver más'),
      );
    }),
  );
}

const OP_CANONICAL = [
  { key: 'venta', label: 'Venta', match: (s) => /venta|sale/i.test(s || '') && !/temp/i.test(s || '') },
  { key: 'alquiler', label: 'Alquiler', match: (s) => /alquiler|rent/i.test(s || '') && !/temp/i.test(s || '') },
  { key: 'temporario', label: 'Alquiler temporario', match: (s) => /temp/i.test(s || '') },
];

function OperationTabs({ operations, saveField }) {
  const tabs = OP_CANONICAL.map((c) => ({ ...c, opIndex: operations.findIndex((o) => c.match(o.operation_type)) }));
  const firstEnabled = tabs.find((t) => t.opIndex >= 0) || tabs[0];
  const [activeKey, setActiveKey] = useState(firstEnabled.key);
  const activeTab = tabs.find((t) => t.key === activeKey) || tabs[0];
  const op = activeTab.opIndex >= 0 ? operations[activeTab.opIndex] : null;
  const price = op?.prices?.[0];

  return e(React.Fragment, null,
    e('div', { className: 'op-tabs' },
      tabs.map((t) => e('button', {
        key: t.key,
        type: 'button',
        className: `op-tab${t.key === activeKey ? ' active' : ''}${t.opIndex < 0 ? ' disabled' : ''}`,
        onClick: () => setActiveKey(t.key),
      }, e('span', { className: 'op-tab-badge' }, e('span', { className: 'op-tab-dot' }), t.label))),
    ),
    op
      ? e('div', { className: 'prop-info-grid' },
          e(Row, { label: 'Tipo de operación' }, e(EditableField, { value: op.operation_type, onSave: (v) => saveField(`operations.${activeTab.opIndex}.operation_type`, v) })),
          price && e(Row, { label: `Precio (${price.currency || ''})` }, e(EditableField, { type: 'number', value: price.price, onSave: (v) => saveField(`operations.${activeTab.opIndex}.prices.0.price`, v) })),
        )
      : e('div', { className: 'op-disabled-note' }, 'Operación no habilitada para esta propiedad.'),
  );
}

function AttributesTable({ attrs }) {
  if (!attrs || !attrs.length) return e('div', { className: 'detail-empty-note' }, 'Sin atributos personalizados.');
  return e('div', { className: 'detail-attrs-table' },
    e('div', { className: 'detail-attrs-row detail-attrs-head' }, e('span', null, 'Nombre'), e('span', null, 'Valor')),
    attrs.map((a, i) => e('div', { key: i, className: 'detail-attrs-row' },
      e('span', null, a.name),
      e('span', null, `${a.value ?? '—'}${a.is_measure ? ' m²' : ''}${a.is_expenditure ? ' (expensa)' : ''}`),
    )),
  );
}


function CopyableFact({ icon, value, label }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  }

  return e('button', {
    type: 'button',
    className: `detail-aside-fact detail-aside-fact-copy${copied ? ' copied' : ''}`,
    onClick: handleCopy,
    title: 'Copiar ID',
  },
    e(copied ? Icons.Check : icon, { width: 13, height: 13 }),
    e('span', null, copied ? 'Copiado' : label),
    !copied && e(Icons.Copy, { width: 12, height: 12, className: 'detail-aside-fact-copy-icon' }),
  );
}

function DifusionPlatform({ platform, label, accent, data, onUpdate }) {
  const [url, setUrl] = useState(data?.url || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setUrl(data?.url || ''); }, [data?.url]);

  async function toggle() {
    setSaving(true);
    try { await onUpdate(platform, { published: !data?.published, url }); }
    finally { setSaving(false); }
  }

  async function saveUrl() {
    if (url === (data?.url || '')) return;
    setSaving(true);
    try { await onUpdate(platform, { published: !!data?.published, url }); }
    finally { setSaving(false); }
  }

  const published = !!data?.published;

  return e('div', { className: 'difusion-card', style: { '--difusion-accent': accent } },
    e('div', { className: 'difusion-card-head' },
      e('div', { className: 'difusion-card-title' }, label),
      e('button', {
        type: 'button', className: `difusion-toggle${published ? ' on' : ''}`,
        onClick: toggle, disabled: saving, title: published ? 'Marcar como no publicada' : 'Marcar como publicada',
      }, e('span', { className: 'difusion-toggle-knob' })),
    ),
    e('div', { className: `difusion-card-status${published ? ' on' : ''}` },
      e('span', { className: 'difusion-status-dot' }),
      published ? 'Publicada' : 'No publicada',
    ),
    e('div', { className: 'difusion-card-field' },
      e('label', null, 'Link del aviso'),
      e('div', { className: 'difusion-url-row' },
        e('input', {
          type: 'text', className: 'difusion-url-input', value: url, placeholder: 'https://…',
          onChange: (ev) => setUrl(ev.target.value), onBlur: saveUrl,
          onKeyDown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); },
        }),
        url && e('a', { href: url, target: '_blank', rel: 'noopener noreferrer', className: 'btn ghost xs', title: 'Abrir aviso' },
          e(Icons.ExternalLink, { width: 12, height: 12 })),
      ),
    ),
    data?.updated_at && e('div', { className: 'difusion-card-updated' },
      `Actualizado ${new Date(data.updated_at).toLocaleDateString('es-AR')}`),
  );
}

let mlListingTypesCache = null;

function qualityTone(pct) {
  if (pct == null) return 'unknown';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

function MlListingRow({ listing: l, listingTypes, onUpgrade }) {
  const [showRecs, setShowRecs] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const tone = qualityTone(l.health_percentage);
  const actions = l.health_actions || [];

  async function handleTierChange(ev) {
    const nextTier = ev.target.value;
    if (!nextTier || nextTier === l.listing_type_id) return;
    const nextLabel = listingTypes.find((t) => t.id === nextTier)?.name || nextTier;
    if (!confirm(`Cambiar a "${nextLabel}" puede tener un costo adicional en MercadoLibre. ¿Confirmás?`)) return;
    setUpgrading(true);
    try {
      await onUpgrade(l.operation_type, nextTier);
    } finally {
      setUpgrading(false);
    }
  }

  return e('div', { className: 'ml-listing-row' },
    e('div', { className: 'ml-listing-row-head' },
      e('div', { className: `difusion-card-status${l.status === 'active' ? ' on' : ''}` },
        e('span', { className: 'difusion-status-dot' }),
        `${ML_OPERATION_LABELS[l.operation_type] || l.operation_type}: ${ML_STATUS_LABELS[l.status] || l.status}`,
      ),
      l.url && e('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', className: 'btn ghost xs' },
        e(Icons.ExternalLink, { width: 12, height: 12 }), 'Ver aviso'),
    ),

    l.item_id && listingTypes.length > 0 && e('div', { className: 'ml-tier-row' },
      e(Icons.Star, { width: 13, height: 13 }),
      e('select', {
        className: 'ml-tier-select', value: l.listing_type_id || '', disabled: upgrading, onChange: handleTierChange,
      }, listingTypes.map((t) => e('option', { key: t.id, value: t.id }, t.name))),
    ),

    l.health_percentage != null && e('div', { className: 'ml-quality' },
      e('div', { className: 'ml-quality-head' },
        e('span', null, 'Calidad de la publicación'),
        e('span', { className: `ml-quality-pct tone-${tone}` }, `${l.health_percentage}%`),
      ),
      e('div', { className: 'ml-quality-bar' },
        e('div', { className: `ml-quality-fill tone-${tone}`, style: { width: `${l.health_percentage}%` } }),
      ),
      actions.length > 0 && e('button', {
        type: 'button', className: 'btn ghost xs ml-recs-toggle', onClick: () => setShowRecs((v) => !v),
      }, e(Icons.AlertTriangle, { width: 12, height: 12 }), `${showRecs ? 'Ocultar' : 'Ver'} recomendaciones (${actions.length})`),
      showRecs && e('ul', { className: 'ml-recs-list' },
        actions.map((a, i) => e('li', { key: i }, a)),
      ),
    ),

    l.last_error && e('div', { className: 'ml-listing-error' }, l.last_error),
    l.updated_at && e('div', { className: 'difusion-card-updated' },
      `Actualizado ${new Date(l.updated_at).toLocaleDateString('es-AR')}`),
  );
}

function MercadoLibreCard({ property, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [listingTypes, setListingTypes] = useState(mlListingTypesCache || []);
  const data = property.difusion?.mercadolibre;
  const listings = data?.listings || [];

  useEffect(() => {
    if (mlListingTypesCache) return;
    getMercadoLibreListingTypes()
      .then((types) => { mlListingTypesCache = types || []; setListingTypes(mlListingTypesCache); })
      .catch(() => {});
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError('');
    try {
      const result = await syncPropertyMercadoLibre(property.id);
      onSynced(result.listings || []);
    } catch (err) {
      setError(err.message || 'No se pudo sincronizar con MercadoLibre.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleUpgrade(operationType, listingTypeId) {
    try {
      const result = await upgradeMercadoLibreListingType(property.id, { operation_type: operationType, listing_type_id: listingTypeId });
      onSynced(result.listings || []);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el nivel de publicación.');
    }
  }

  return e('div', { className: 'difusion-card', style: { '--difusion-accent': '#ffe600' } },
    e('div', { className: 'difusion-card-head' },
      e('div', { className: 'difusion-card-title' }, 'MercadoLibre'),
      e('button', {
        type: 'button', className: 'btn ghost xs', onClick: handleSync, disabled: syncing,
      }, e(Icons.RefreshCw, { width: 12, height: 12 }), syncing ? 'Sincronizando…' : 'Sincronizar ahora'),
    ),
    listings.length === 0
      ? e('div', { className: 'difusion-card-status' }, e('span', { className: 'difusion-status-dot' }), 'Todavía no se publicó')
      : listings.map((l) => e(MlListingRow, { key: l.operation_type, listing: l, listingTypes, onUpgrade: handleUpgrade })),
    error && e('div', { className: 'ml-listing-error' }, error),
  );
}

export default function PropertyDetail({ property: initialProperty, onBack, onClose, canClose }) {
  const [property, setProperty] = useState(initialProperty);
  const [activeTab, setActiveTab] = useState('detalles');
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => { setProperty(initialProperty); }, [initialProperty]);
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = property.publication_title || property.address || 'Propiedad — CRM';
    }
  }, [property.publication_title, property.address]);

  async function saveField(path, value) {
    const updated = await updateProperty(property.id, { [path]: value });
    setProperty(updated);
    return updated;
  }

  async function handleStatusChange(newStatus) {
    if (newStatus === property.status) return;
    setChangingStatus(true);
    try {
      const updated = await updatePropertyStatus(property.id, newStatus);
      setProperty(updated);
    } catch (err) {
      alert(err.message || 'No se pudo cambiar el estado.');
    } finally {
      setChangingStatus(false);
    }
  }

  async function saveLocation(lat, lng) {
    const updated = await updateProperty(property.id, { geo_lat: lat, geo_long: lng });
    setProperty(updated);
  }

  async function saveDifusion(platform, data) {
    const updated = await updatePropertyDifusion(property.id, { platform, ...data });
    setProperty(updated);
    return updated;
  }

  function onMercadoLibreSynced(listings) {
    setProperty((prev) => ({
      ...prev,
      difusion: {
        ...prev.difusion,
        mercadolibre: { ...prev.difusion?.mercadolibre, listings },
      },
    }));
  }

  const photos = property.photos || [];
  const priceLabel = formatPrice(property.operations);
  const cover = photoSrc(photos[0]);

  return e('div', { className: 'property-detail' },
    e('div', { className: 'detail-header' },
      e('button', { className: 'btn ghost sm detail-back', onClick: onBack },
        e(Icons.ChevronLeft, { width: 14, height: 14 }), 'Propiedades'),
      e('div', { className: 'detail-crumb-sep' }, '/'),
      e('h1', null, property.publication_title || property.address || 'Propiedad'),
      e('div', { className: 'detail-header-actions' },
        e('a', {
          href: propertyWebUrl(property), target: '_blank', rel: 'noopener noreferrer', className: 'btn ghost sm',
        }, e(Icons.ExternalLink, { width: 13, height: 13 }), 'Ver en la web'),
        canClose && e('button', { className: 'btn ghost sm', onClick: onClose, title: 'Cerrar pestaña' },
          e(Icons.Close, { width: 14, height: 14 }), 'Cerrar'),
      ),
    ),

    e('div', { className: 'detail-pinned' },
      e('div', { className: 'detail-section detail-section-split' },
        e('aside', { className: 'detail-section-aside' },
          e('div', { className: 'detail-aside-card' },
            cover
              ? e('div', { className: 'detail-aside-cover' }, e('img', { src: cover, alt: 'Portada' }))
              : e('div', { className: 'detail-aside-cover empty' }, e(Icons.Building, { width: 28, height: 28 })),
            e('div', { className: 'detail-aside-body' },
              priceLabel && e('div', { className: 'detail-aside-price' }, priceLabel),

              e('div', { className: 'detail-aside-facts' },
                e(CopyableFact, { icon: Icons.Hash, value: property.id, label: `ID ${property.id}` }),
                property.reference_code && e('div', { className: 'detail-aside-fact' }, e(Icons.Tag, { width: 13, height: 13 }), property.reference_code),
                property.location?.name && e('div', { className: 'detail-aside-fact' }, e(Icons.MapPin, { width: 13, height: 13 }), property.location.name),
                photos.length > 0 && e('div', { className: 'detail-aside-fact' }, e(Icons.Image, { width: 13, height: 13 }), `${photos.length} foto${photos.length === 1 ? '' : 's'}`),
              ),
            ),
          ),
        ),
        e('div', { className: 'detail-section-main' },
          e('h3', null, 'Dirección'),
          e('div', { className: 'detail-summary-table' },
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, e(Icons.MapPin, { width: 12, height: 12 }), 'Dirección'),
              e(EditableField, { value: property.address, onSave: (v) => saveField('address', v) }),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, e(Icons.Tag, { width: 12, height: 12 }), 'Referencia | Tipo'),
              e('div', null, `${property.reference_code || '—'} | ${property.type?.name || '—'}`),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, e(Icons.Edit, { width: 12, height: 12 }), 'Título de publicación'),
              e(EditableField, { value: property.publication_title, onSave: (v) => saveField('publication_title', v) }),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, e(Icons.Globe, { width: 12, height: 12 }), 'Ubicación'),
              e(EditableField, { value: property.location?.full_location, onSave: (v) => saveField('location.full_location', v) }),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, e(Icons.MapPin, { width: 12, height: 12 }), 'Barrio / zona'),
              e(EditableField, { value: property.location?.name, onSave: (v) => saveField('location.name', v) }),
            ),
          ),
          e('select', {
            className: `detail-status-bar detail-status-select badge-${property.status}`,
            value: property.status,
            disabled: changingStatus,
            onChange: (ev) => handleStatusChange(ev.target.value),
          }, Object.entries(STATUS_LABELS).map(([key, label]) => e('option', { key, value: key }, label))),
        ),
      ),
    ),

    e('div', { className: 'detail-tabs' },
      PAGE_TABS.map((t) => e('button', {
        key: t.key, type: 'button',
        className: `detail-tab${activeTab === t.key ? ' active' : ''}`,
        onClick: () => setActiveTab(t.key),
      }, t.label, t.key === 'fotos' && photos.length > 0 && e('span', { className: 'detail-tab-count' }, photos.length))),
    ),

    e('div', { className: 'detail-hint-bar' },
      e(Icons.Edit, { width: 12, height: 12 }),
      'Hacé click en cualquier dato para editarlo. Los cambios se guardan solos.',
    ),

    e('div', { className: 'detail-layout' },
      activeTab === 'fotos'
        ? e('div', { className: 'detail-main' }, e(PhotoManager, { property, onPropertyChange: setProperty }))
        : activeTab === 'mapa'
        ? e('div', { className: 'detail-main' },
            e('div', { className: 'detail-section' },
              e('h3', null, 'Ubicación en el mapa'),
              e(PropertyMap, { property, onLocationChange: saveLocation }),
            ),
          )
        : activeTab === 'difusion'
        ? e('div', { className: 'detail-main' },
            e('div', { className: 'detail-section' },
              e('h3', null, 'Difusión en portales'),
              e('p', { className: 'detail-section-sub' }, 'Marcá manualmente si la propiedad está publicada en cada portal y guardá el link del aviso.'),
              e('div', { className: 'difusion-grid' },
                e(MercadoLibreCard, { key: 'mercadolibre', property, onSynced: onMercadoLibreSynced }),
                DIFUSION_PLATFORMS.map((p) => e(DifusionPlatform, {
                  key: p.key, platform: p.key, label: p.label, accent: p.accent,
                  data: property.difusion?.[p.key], onUpdate: saveDifusion,
                })),
              ),
            ),
          )
        : activeTab === 'estadisticas'
        ? e('div', { className: 'detail-main' },
            e('div', { className: 'detail-section' },
              e('h3', null, 'Estadísticas de MercadoLibre'),
              e('p', { className: 'detail-section-sub' }, 'Visitas, contactos e interesados que generó esta propiedad en MercadoLibre.'),
              e(MlStats, { property }),
            ),
          )
        : e('div', { className: 'detail-main' },

        e('div', { className: 'detail-section' },
          e('h3', null, 'Tasación'),
          e(OperationTabs, { operations: property.operations || [], saveField }),
          e('div', { className: 'prop-info-grid' },
            e(Row, { label: 'Crédito', icon: Icons.Check }, e(EditableField, { value: property.credit_eligible, onSave: (v) => saveField('credit_eligible', v), placeholder: 'No especificado' })),
            e(Row, { label: 'Expensas', icon: Icons.DollarSign }, e(EditableField, { type: 'number', value: property.expenses, onSave: (v) => saveField('expenses', v) })),
          ),
        ),

        e(GroupedSection, {
          title: 'Información general',
          groups: [
            {
              label: 'Características generales',
              rows: [
                e(Row, { key: 'amb', label: 'Ambientes', icon: Icons.Layers }, e(EditableField, { type: 'number', value: property.suite_amount, onSave: (v) => saveField('suite_amount', v) })),
                e(Row, { key: 'age', label: 'Antigüedad', icon: Icons.Calendar }, e(EditableField, { type: 'number', value: property.age, onSave: (v) => saveField('age', v) })),
                e(Row, { key: 'bath', label: 'Baños', icon: Icons.Bath }, e(EditableField, { type: 'number', value: property.bathroom_amount, onSave: (v) => saveField('bathroom_amount', v) })),
                e(Row, { key: 'cond', label: 'Condición', icon: Icons.Check }, e(EditableField, { value: property.property_condition, onSave: (v) => saveField('property_condition', v) })),
                e(Row, { key: 'room', label: 'Dormitorios', icon: Icons.Bed }, e(EditableField, { type: 'number', value: property.room_amount, onSave: (v) => saveField('room_amount', v) })),
                e(Row, { key: 'orient', label: 'Orientación', icon: Icons.Compass }, e(EditableField, { value: property.orientation, onSave: (v) => saveField('orientation', v) })),
                e(Row, { key: 'floors', label: 'Plantas', icon: Icons.Home2 }, e(EditableField, { type: 'number', value: property.floors_amount, onSave: (v) => saveField('floors_amount', v) })),
                e(Row, { key: 'sit', label: 'Situación', icon: Icons.Tag }, e(EditableField, { value: property.situation, onSave: (v) => saveField('situation', v) })),
                e(Row, { key: 'suites', label: 'Suites', icon: Icons.Bed }, e(EditableField, { type: 'number', value: property.total_suites, onSave: (v) => saveField('total_suites', v) })),
                e(Row, { key: 'suitescl', label: 'Suites con placares', icon: Icons.Bed }, e(EditableField, { type: 'number', value: property.suites_with_closets, onSave: (v) => saveField('suites_with_closets', v) })),
                e(Row, { key: 'toilet', label: 'Toilettes', icon: Icons.Bath }, e(EditableField, { type: 'number', value: property.toilet_amount, onSave: (v) => saveField('toilet_amount', v) })),
                e(Row, { key: 'zon', label: 'Zonificación', icon: Icons.MapPin }, e(EditableField, { value: property.zonification, onSave: (v) => saveField('zonification', v) })),
              ],
            },
            {
              label: 'Cocheras',
              rows: [
                e(Row, { key: 'park', label: 'Cocheras', icon: Icons.Car }, e(EditableField, { type: 'number', value: property.parking_lot_amount, onSave: (v) => saveField('parking_lot_amount', v) })),
                e(Row, { key: 'parkc', label: 'Cocheras cubiertas', icon: Icons.Car }, e(EditableField, { type: 'number', value: property.covered_parking_lot, onSave: (v) => saveField('covered_parking_lot', v) })),
                e(Row, { key: 'parku', label: 'Cocheras descubiertas', icon: Icons.Car }, e(EditableField, { type: 'number', value: property.uncovered_parking_lot, onSave: (v) => saveField('uncovered_parking_lot', v) })),
              ],
            },
            {
              label: 'Salas comunes',
              rows: [
                e(Row, { key: 'common', label: 'Salas comunes', icon: Icons.Home2 }, e(EditableField, { type: 'number', value: property.common_area, onSave: (v) => saveField('common_area', v) })),
                e(Row, { key: 'living', label: 'Livings', icon: Icons.Home2 }, e(EditableField, { type: 'number', value: property.living_amount, onSave: (v) => saveField('living_amount', v) })),
                e(Row, { key: 'tv', label: 'Salas de TV', icon: Icons.Video }, e(EditableField, { type: 'number', value: property.tv_rooms, onSave: (v) => saveField('tv_rooms', v) })),
                e(Row, { key: 'dining', label: 'Comedores', icon: Icons.Home2 }, e(EditableField, { type: 'number', value: property.dining_room, onSave: (v) => saveField('dining_room', v) })),
              ],
            },
          ],
        }),

        e(Section, { title: 'Superficies y medidas' },
          e(Row, { label: 'Terreno', icon: Icons.Maximize }, e(EditableField, { value: property.surface, onSave: (v) => saveField('surface', v) })),
          e(Row, { label: 'Descubierta', icon: Icons.Maximize }, e(EditableField, { value: property.unroofed_surface, onSave: (v) => saveField('unroofed_surface', v) })),
          e(Row, { label: 'Superficie cubierta', icon: Icons.Maximize }, e(EditableField, { value: property.roofed_surface, onSave: (v) => saveField('roofed_surface', v) })),
          e(Row, { label: 'Superficie semicubierta', icon: Icons.Maximize }, e(EditableField, { value: property.semiroofed_surface, onSave: (v) => saveField('semiroofed_surface', v) })),
          e(Row, { label: 'Total construido', icon: Icons.Maximize }, e(EditableField, { value: property.total_surface, onSave: (v) => saveField('total_surface', v) })),
          e(Row, { label: 'Fondo', icon: Icons.Maximize }, e(EditableField, { value: property.depth_measure, onSave: (v) => saveField('depth_measure', v) })),
          e(Row, { label: 'Frente', icon: Icons.Maximize }, e(EditableField, { value: property.front_measure, onSave: (v) => saveField('front_measure', v) })),
        ),

        e('div', { className: 'detail-section' },
          e('h3', null, 'Servicios, ambientes y adicionales'),
          e(ServicesAmenitiesEditor, { property, saveField }),
        ),

        e('div', { className: 'detail-section' },
          e('h3', null, 'Descripción'),
          e(EditableField, { value: property.description, onSave: (v) => saveField('description', v), multiline: true, placeholder: 'Sin descripción — click para agregar' }),
        ),

        e('div', { className: 'detail-section' },
          e('h3', null, 'Atributos personalizados'),
          e(AttributesTable, { attrs: property.extra_attributes }),
        ),

        e('div', { className: 'detail-section' },
          e('h3', null, 'Información interna'),
          e('div', { className: 'detail-subgroup' },
            e('h4', null, 'Contacto / productor'),
            e('div', { className: 'prop-info-grid' },
              e(Row, { label: 'Nombre', icon: Icons.User }, e(EditableField, { value: property.producer?.name, onSave: (v) => saveField('producer.name', v) })),
              e(Row, { label: 'Teléfono', icon: Icons.Phone }, e(EditableField, { value: property.producer?.phone, onSave: (v) => saveField('producer.phone', v) })),
              e(Row, { label: 'Email', icon: Icons.Mail }, e(EditableField, { value: property.producer?.email, onSave: (v) => saveField('producer.email', v) })),
            ),
          ),
          e('div', { className: 'detail-subgroup' },
            e('h4', null, 'Datos internos'),
            e('div', { className: 'prop-info-grid' },
              e(Row, { label: 'Comisión', icon: Icons.DollarSign }, e(EditableField, { value: property.internal_data?.commission, onSave: (v) => saveField('internal_data.commission', v) })),
              e(Row, { label: 'Comisión productor', icon: Icons.DollarSign }, e(EditableField, { value: property.internal_data?.producer_comision, onSave: (v) => saveField('internal_data.producer_comision', v) })),
              e(Row, { label: 'Ubicación de llave', icon: Icons.Settings }, e(EditableField, { value: property.internal_data?.key_location, onSave: (v) => saveField('internal_data.key_location', v) })),
              e(Row, { label: 'Estado legal', icon: Icons.Check }, e(EditableField, { value: property.internal_data?.legally_checked_text, onSave: (v) => saveField('internal_data.legally_checked_text', v) })),
            ),
          ),
          e('div', { className: 'detail-subgroup' },
            e('h4', null, 'Comentarios internos'),
            e(EditableField, { value: property.internal_data?.internal_comments, onSave: (v) => saveField('internal_data.internal_comments', v), multiline: true, placeholder: 'Sin comentarios — click para agregar' }),
          ),
          e('div', { className: 'detail-subgroup' },
            e('h4', null, 'Requisitos de la transacción'),
            e(EditableField, { value: property.internal_data?.transaction_requirements, onSave: (v) => saveField('internal_data.transaction_requirements', v), multiline: true, placeholder: 'Sin requisitos — click para agregar' }),
          ),
          e('div', { className: 'detail-subgroup' },
            e('h4', null, 'Notas del equipo'),
            e(EditableField, { value: property.notes, onSave: (v) => saveField('notes', v), multiline: true, placeholder: 'Sin notas — click para agregar' }),
          ),
        ),
      ),
    ),
  );
}
