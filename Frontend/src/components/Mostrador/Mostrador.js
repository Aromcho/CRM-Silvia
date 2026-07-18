'use client';
import React from 'react';
import QRCode from 'qrcode';
import Icons from '../Icons/Icons';
import { getProperties } from '@/services/api';
import './Mostrador.css';

const e = React.createElement;
const { useState, useCallback, useRef } = React;

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:7003';
const SUCURSALES = ['Mar Azul', 'Mar de las Pampas'];
const LIMIT = 8;

const WEBSITE_URL = 'https://www.silviafernandezpropiedades.com.ar';
const WEBSITE_DISPLAY = 'www.silviafernandezpropiedades.com.ar';
const PHONE_DISPLAY = '+54 9 2255 50-9408';

function photoSrc(photo) {
  if (!photo) return null;
  if (photo.local_image) return photo.local_image.startsWith('http') ? photo.local_image : `${API_BASE}${photo.local_image}`;
  if (photo.image_url) return photo.image_url;
  if (photo.image) return photo.image;
  return null;
}

function todayLabel() {
  return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ResultRow({ property, onAdd, added }) {
  const src = photoSrc(property.photos?.[0]);
  return e('div', { className: 'mostrador-result-row' },
    e('div', { className: 'mostrador-result-thumb' },
      src ? e('img', { src, alt: '', loading: 'lazy' }) : e(Icons.Building, { width: 18, height: 18 }),
    ),
    e('div', { className: 'mostrador-result-info' },
      e('div', { className: 'mostrador-result-address' }, property.address || property.publication_title || 'Sin dirección'),
      e('div', { className: 'mostrador-result-meta' },
        [
          property.room_amount > 0 ? `${property.room_amount} hab.` : null,
          property.bathroom_amount > 0 ? `${property.bathroom_amount} baños` : null,
          property.total_surface ? `${property.total_surface} m²` : null,
        ].filter(Boolean).join(' · ') || 'Sin datos de superficie',
      ),
    ),
    e('button', {
      className: `btn ${added ? 'ghost' : 'primary'} xs`,
      onClick: () => onAdd(property),
      disabled: added,
    }, added ? e(Icons.Check, { width: 13, height: 13 }) : e(Icons.Plus, { width: 13, height: 13 }), added ? 'Agregada' : 'Agregar'),
  );
}

function PrintRow({ property, qrSrc, onRemove }) {
  const src = photoSrc(property.photos?.[0]);
  return e('div', { className: 'mostrador-print-row' },
    e('button', {
      className: 'mostrador-print-remove no-print', onClick: () => onRemove(property.id), title: 'Quitar de la lista',
    }, e(Icons.Close, { width: 12, height: 12 })),

    e('div', { className: 'mostrador-print-media' },
      e('div', { className: 'mostrador-print-img' },
        src ? e('img', { src, alt: '' }) : e('div', { className: 'mostrador-print-noimg' }, e(Icons.Building, { width: 28, height: 28 })),
      ),
      e('div', { className: 'mostrador-print-icons' },
        e('span', null, e(Icons.Bed, { width: 12, height: 12 }), property.room_amount != null ? property.room_amount : '—'),
        e('span', null, e(Icons.Bath, { width: 12, height: 12 }), property.bathroom_amount != null ? property.bathroom_amount : '—'),
        e('span', null, e(Icons.Maximize, { width: 12, height: 12 }), property.total_surface ? `${property.total_surface} m²` : '—'),
      ),
    ),

    e('div', { className: 'mostrador-print-info' },
      e('div', { className: 'mostrador-print-address' }, property.address || property.publication_title || 'Sin dirección'),
      e('div', { className: 'mostrador-print-lines' },
        e('div', { className: 'mostrador-print-line' }),
        e('div', { className: 'mostrador-print-line' }),
        e('div', { className: 'mostrador-print-line' }),
      ),
    ),

    e('div', { className: 'mostrador-print-qr' },
      qrSrc
        ? e('img', { src: qrSrc, alt: 'Código QR de la propiedad' })
        : e('div', { className: 'mostrador-print-qr-placeholder' }),
      e('span', { className: 'mostrador-print-qr-label' }, 'Ver ficha'),
    ),
  );
}

export default function Mostrador() {
  const [sucursal, setSucursal] = useState(SUCURSALES[0]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [qrMap, setQrMap] = useState({});
  const searchRef = useRef(null);

  const runSearch = useCallback(async () => {
    if (!search.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await getProperties({ limit: LIMIT, offset: 0, order: 'DESC', searchQuery: search });
      setResults(data?.objects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  function handleSearchKeyDown(ev) {
    if (ev.key === 'Enter') runSearch();
  }

  async function addProperty(property) {
    setSelected((prev) => (prev.some((p) => p.id === property.id) ? prev : [...prev, property]));
    if (qrMap[property.id]) return;
    try {
      const dataUrl = await QRCode.toDataURL(`${WEBSITE_URL}/propiedad/${property.id}`, {
        margin: 1, width: 160, color: { dark: '#16241d', light: '#ffffff' },
      });
      setQrMap((prev) => ({ ...prev, [property.id]: dataUrl }));
    } catch (err) {
      console.error(err);
    }
  }

  function removeProperty(id) {
    setSelected((prev) => prev.filter((p) => p.id !== id));
  }

  return e('div', { className: 'mostrador' },

    e('div', { className: 'mostrador-toolbar no-print' },
      e('div', { className: 'mostrador-toolbar-left' },
        e('h1', null, 'Mostrador de propiedades'),
        e('span', { className: 'prop-count-pill' }, `${selected.length} seleccionadas`),
      ),
      e('div', { className: 'mostrador-toolbar-right' },
        e('select', {
          className: 'filter-select', value: sucursal, onChange: (ev) => setSucursal(ev.target.value),
          title: 'Sucursal (aparece en el encabezado de la hoja impresa)',
        }, SUCURSALES.map((s) => e('option', { key: s, value: s }, s))),
        e('button', {
          className: 'btn primary sm', onClick: () => window.print(), disabled: selected.length === 0,
        }, e(Icons.Printer, { width: 13, height: 13 }), 'Imprimir'),
      ),
    ),

    e('div', { className: 'mostrador-search-panel no-print' },
      e('div', { className: 'mostrador-search-row' },
        e('div', { className: 'search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', {
            ref: searchRef, placeholder: 'Buscar por dirección, tipo, ref…', value: search,
            onChange: (ev) => setSearch(ev.target.value), onKeyDown: handleSearchKeyDown, style: { width: 280 },
          }),
          search ? e('button', { className: 'search-clear', onClick: () => { setSearch(''); setResults([]); } }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
        e('button', { className: 'btn ghost sm', onClick: runSearch }, e(Icons.Search, { width: 13, height: 13 }), 'Buscar'),
        loading && e('span', { className: 'mostrador-loading' }, 'Buscando…'),
      ),
      results.length > 0 && e('div', { className: 'mostrador-results' },
        results.map((p) => e(ResultRow, {
          key: p.id, property: p, onAdd: addProperty, added: selected.some((s) => s.id === p.id),
        })),
      ),
    ),

    e('div', { className: 'mostrador-print-area' },
      e('div', { className: 'mostrador-print-topbar' }),
      e('div', { className: 'mostrador-print-header' },
        e('img', { className: 'mostrador-print-logo', src: '/logo.webp', alt: 'Silvia Fernández Propiedades' }),
        e('div', { className: 'mostrador-print-header-text' },
          e('div', { className: 'mostrador-print-title' }, 'Propiedades seleccionadas'),
          e('div', { className: 'mostrador-print-meta' }, `Sucursal: ${sucursal}   ·   ${todayLabel()}`),
        ),
      ),

      selected.length === 0
        ? e('div', { className: 'mostrador-empty no-print' },
            e(Icons.Building, { width: 40, height: 40 }),
            e('p', null, 'Buscá y agregá propiedades para armar la lista para imprimir'),
          )
        : e('div', { className: 'mostrador-print-list' },
            selected.map((p) => e(PrintRow, { key: p.id, property: p, qrSrc: qrMap[p.id], onRemove: removeProperty })),
          ),

      e('div', { className: 'mostrador-print-footer' },
        e('span', { className: 'mostrador-print-footer-item' }, e(Icons.Phone, { width: 13, height: 13 }), PHONE_DISPLAY),
        e('span', { className: 'mostrador-print-footer-sep' }, '·'),
        e('span', { className: 'mostrador-print-footer-item' }, e(Icons.Globe, { width: 13, height: 13 }), WEBSITE_DISPLAY),
      ),
    ),
  );
}
