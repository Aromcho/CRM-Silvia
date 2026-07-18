'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import EditableField from '../UI/EditableField';
import PhotoManager from './PhotoManager';
import { updateProperty, updatePropertyDifusion } from '@/services/api';
import { photoSrc, formatPrice, STATUS_LABELS } from '@/lib/data';
import './Propiedades.css';
import './PropertyDetail.css';

const e = React.createElement;
const { useState, useEffect } = React;

const PAGE_TABS = [
  { key: 'detalles', label: 'Detalles' },
  { key: 'fotos', label: 'Fotos' },
  { key: 'difusion', label: 'Difusión' },
];

const DIFUSION_PLATFORMS = [
  { key: 'mercadolibre', label: 'MercadoLibre', accent: '#ffe600' },
  { key: 'zonaprop', label: 'ZonaProp', accent: '#00b4f0' },
];

function Row({ label, children }) {
  return e('div', { className: 'prop-info-item' },
    e('div', { className: 'prop-info-label' }, label),
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

const TAG_GROUP_LABELS = { 1: 'Servicios', 2: 'Ambientes', 3: 'Adicionales' };
const TAG_GROUP_ORDER = ['Servicios', 'Ambientes', 'Adicionales', 'Otros'];

function TagChips({ tags }) {
  if (!tags || !tags.length) return e('div', { className: 'detail-empty-note' }, 'Sin servicios, ambientes o adicionales sincronizados desde Tokko.');

  const groups = {};
  tags.forEach((t) => {
    const label = TAG_GROUP_LABELS[t.type] || 'Otros';
    (groups[label] = groups[label] || []).push(t);
  });

  return TAG_GROUP_ORDER.filter((label) => groups[label]?.length).map((label) =>
    e('div', { key: label, className: 'detail-chip-group' },
      e('h4', null, label),
      e('div', { className: 'detail-tag-list' },
        groups[label].map((t, i) => e('span', { key: t.id ?? i, className: 'detail-tag' },
          e(Icons.Check, { width: 11, height: 11 }), t.name)),
      ),
    ),
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

export default function PropertyDetail({ property: initialProperty, onBack, onClose, canClose }) {
  const [property, setProperty] = useState(initialProperty);
  const [activeTab, setActiveTab] = useState('detalles');

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

  async function saveDifusion(platform, data) {
    const updated = await updatePropertyDifusion(property.id, { platform, ...data });
    setProperty(updated);
    return updated;
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
        property.public_url && e('a', {
          href: property.public_url, target: '_blank', rel: 'noopener noreferrer', className: 'btn ghost sm',
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
              e('div', { className: 'prop-info-label' }, 'Dirección'),
              e(EditableField, { value: property.address, onSave: (v) => saveField('address', v) }),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, 'Referencia | Tipo'),
              e('div', null, `${property.reference_code || '—'} | ${property.type?.name || '—'}`),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, 'Título de publicación'),
              e(EditableField, { value: property.publication_title, onSave: (v) => saveField('publication_title', v) }),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, 'Ubicación'),
              e(EditableField, { value: property.location?.full_location, onSave: (v) => saveField('location.full_location', v) }),
            ),
            e('div', { className: 'detail-summary-row' },
              e('div', { className: 'prop-info-label' }, 'Barrio / zona'),
              e(EditableField, { value: property.location?.name, onSave: (v) => saveField('location.name', v) }),
            ),
          ),
          e('div', { className: `detail-status-bar badge-${property.status}` }, STATUS_LABELS[property.status] || property.status),
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
        : activeTab === 'difusion'
        ? e('div', { className: 'detail-main' },
            e('div', { className: 'detail-section' },
              e('h3', null, 'Difusión en portales'),
              e('p', { className: 'detail-section-sub' }, 'Marcá manualmente si la propiedad está publicada en cada portal y guardá el link del aviso.'),
              e('div', { className: 'difusion-grid' },
                DIFUSION_PLATFORMS.map((p) => e(DifusionPlatform, {
                  key: p.key, platform: p.key, label: p.label, accent: p.accent,
                  data: property.difusion?.[p.key], onUpdate: saveDifusion,
                })),
              ),
            ),
          )
        : e('div', { className: 'detail-main' },

        e('div', { className: 'detail-section' },
          e('h3', null, 'Tasación'),
          e(OperationTabs, { operations: property.operations || [], saveField }),
          e('div', { className: 'prop-info-grid' },
            e(Row, { label: 'Crédito' }, e(EditableField, { value: property.credit_eligible, onSave: (v) => saveField('credit_eligible', v), placeholder: 'No especificado' })),
            e(Row, { label: 'Expensas' }, e(EditableField, { type: 'number', value: property.expenses, onSave: (v) => saveField('expenses', v) })),
          ),
        ),

        e(GroupedSection, {
          title: 'Información general',
          groups: [
            {
              label: 'Características generales',
              rows: [
                e(Row, { key: 'amb', label: 'Ambientes' }, e(EditableField, { type: 'number', value: property.suite_amount, onSave: (v) => saveField('suite_amount', v) })),
                e(Row, { key: 'age', label: 'Antigüedad' }, e(EditableField, { type: 'number', value: property.age, onSave: (v) => saveField('age', v) })),
                e(Row, { key: 'bath', label: 'Baños' }, e(EditableField, { type: 'number', value: property.bathroom_amount, onSave: (v) => saveField('bathroom_amount', v) })),
                e(Row, { key: 'cond', label: 'Condición' }, e(EditableField, { value: property.property_condition, onSave: (v) => saveField('property_condition', v) })),
                e(Row, { key: 'room', label: 'Dormitorios' }, e(EditableField, { type: 'number', value: property.room_amount, onSave: (v) => saveField('room_amount', v) })),
                e(Row, { key: 'orient', label: 'Orientación' }, e(EditableField, { value: property.orientation, onSave: (v) => saveField('orientation', v) })),
                e(Row, { key: 'floors', label: 'Plantas' }, e(EditableField, { type: 'number', value: property.floors_amount, onSave: (v) => saveField('floors_amount', v) })),
                e(Row, { key: 'sit', label: 'Situación' }, e(EditableField, { value: property.situation, onSave: (v) => saveField('situation', v) })),
                e(Row, { key: 'suites', label: 'Suites' }, e(EditableField, { type: 'number', value: property.total_suites, onSave: (v) => saveField('total_suites', v) })),
                e(Row, { key: 'suitescl', label: 'Suites con placares' }, e(EditableField, { type: 'number', value: property.suites_with_closets, onSave: (v) => saveField('suites_with_closets', v) })),
                e(Row, { key: 'toilet', label: 'Toilettes' }, e(EditableField, { type: 'number', value: property.toilet_amount, onSave: (v) => saveField('toilet_amount', v) })),
                e(Row, { key: 'zon', label: 'Zonificación' }, e(EditableField, { value: property.zonification, onSave: (v) => saveField('zonification', v) })),
              ],
            },
            {
              label: 'Cocheras',
              rows: [
                e(Row, { key: 'park', label: 'Cocheras' }, e(EditableField, { type: 'number', value: property.parking_lot_amount, onSave: (v) => saveField('parking_lot_amount', v) })),
                e(Row, { key: 'parkc', label: 'Cocheras cubiertas' }, e(EditableField, { type: 'number', value: property.covered_parking_lot, onSave: (v) => saveField('covered_parking_lot', v) })),
                e(Row, { key: 'parku', label: 'Cocheras descubiertas' }, e(EditableField, { type: 'number', value: property.uncovered_parking_lot, onSave: (v) => saveField('uncovered_parking_lot', v) })),
              ],
            },
            {
              label: 'Salas comunes',
              rows: [
                e(Row, { key: 'common', label: 'Salas comunes' }, e(EditableField, { type: 'number', value: property.common_area, onSave: (v) => saveField('common_area', v) })),
                e(Row, { key: 'living', label: 'Livings' }, e(EditableField, { type: 'number', value: property.living_amount, onSave: (v) => saveField('living_amount', v) })),
                e(Row, { key: 'tv', label: 'Salas de TV' }, e(EditableField, { type: 'number', value: property.tv_rooms, onSave: (v) => saveField('tv_rooms', v) })),
                e(Row, { key: 'dining', label: 'Comedores' }, e(EditableField, { type: 'number', value: property.dining_room, onSave: (v) => saveField('dining_room', v) })),
              ],
            },
          ],
        }),

        e(Section, { title: 'Superficies y medidas' },
          e(Row, { label: 'Terreno' }, e(EditableField, { value: property.surface, onSave: (v) => saveField('surface', v) })),
          e(Row, { label: 'Descubierta' }, e(EditableField, { value: property.unroofed_surface, onSave: (v) => saveField('unroofed_surface', v) })),
          e(Row, { label: 'Superficie cubierta' }, e(EditableField, { value: property.roofed_surface, onSave: (v) => saveField('roofed_surface', v) })),
          e(Row, { label: 'Superficie semicubierta' }, e(EditableField, { value: property.semiroofed_surface, onSave: (v) => saveField('semiroofed_surface', v) })),
          e(Row, { label: 'Total construido' }, e(EditableField, { value: property.total_surface, onSave: (v) => saveField('total_surface', v) })),
          e(Row, { label: 'Fondo' }, e(EditableField, { value: property.depth_measure, onSave: (v) => saveField('depth_measure', v) })),
          e(Row, { label: 'Frente' }, e(EditableField, { value: property.front_measure, onSave: (v) => saveField('front_measure', v) })),
        ),

        e('div', { className: 'detail-section' },
          e('h3', null, 'Servicios, ambientes y adicionales'),
          e(TagChips, { tags: [...(property.tags || []), ...(property.custom_tags || [])] }),
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
              e(Row, { label: 'Nombre' }, e(EditableField, { value: property.producer?.name, onSave: (v) => saveField('producer.name', v) })),
              e(Row, { label: 'Teléfono' }, e(EditableField, { value: property.producer?.phone, onSave: (v) => saveField('producer.phone', v) })),
              e(Row, { label: 'Email' }, e(EditableField, { value: property.producer?.email, onSave: (v) => saveField('producer.email', v) })),
            ),
          ),
          e('div', { className: 'detail-subgroup' },
            e('h4', null, 'Datos internos'),
            e('div', { className: 'prop-info-grid' },
              e(Row, { label: 'Comisión' }, e(EditableField, { value: property.internal_data?.commission, onSave: (v) => saveField('internal_data.commission', v) })),
              e(Row, { label: 'Comisión productor' }, e(EditableField, { value: property.internal_data?.producer_comision, onSave: (v) => saveField('internal_data.producer_comision', v) })),
              e(Row, { label: 'Ubicación de llave' }, e(EditableField, { value: property.internal_data?.key_location, onSave: (v) => saveField('internal_data.key_location', v) })),
              e(Row, { label: 'Estado legal' }, e(EditableField, { value: property.internal_data?.legally_checked_text, onSave: (v) => saveField('internal_data.legally_checked_text', v) })),
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
