'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getProperties, syncPropertyMercadoLibre, syncPropertyZonaProp } from '@/services/api';
import { photoSrc, STATUS_LABELS } from '@/lib/data';

// Difusión en una sola tabla (C5): cada propiedad con Web, MercadoLibre y ZonaProp, el plan o el
// motivo del error, y una acción por fila. Arriba, los errores agrupados por motivo.

const e = React.createElement;
const { useState, useEffect, useMemo, useCallback } = React;

const FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'errores', label: 'Con error' },
  { key: 'sin_ml', label: 'Sin MercadoLibre' },
  { key: 'sin_zp', label: 'Sin ZonaProp' },
  { key: 'pausadas', label: 'Pausadas / en revisión' },
  { key: 'ok', label: 'En todos lados' },
];

const PUBLISHABLE = ['disponible', 'reservada'];

function errorKey(text) {
  return String(text || '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Error sin detalle';
}

function cover(p) {
  const photos = (p.photos || []).filter((x) => !x.is_blueprint);
  return photos.find((x) => x.is_front_cover) || photos[0];
}

function thumb(p) {
  const src = photoSrc(cover(p));
  return src && /^https?:/.test(src) ? `/_next/image?url=${encodeURIComponent(src)}&w=128&q=65` : src;
}

function Chip({ name, ch, onRetry, busy }) {
  const tone = ch.state;
  return e('div', { className: `dt-ch ${tone}` },
    e('div', { className: 'dt-ch-top' },
      e('b', null, name),
      ch.url && tone === 'on'
        ? e('a', { href: ch.url, target: '_blank', rel: 'noopener noreferrer', title: 'Abrir el aviso' }, ch.label)
        : e('span', null, ch.label),
    ),
    ch.detail && e('div', { className: 'dt-ch-detail', title: ch.detail }, ch.detail),
    onRetry && (tone === 'error' || tone === 'off') && e('button', {
      type: 'button', className: 'dt-ch-retry', disabled: busy, onClick: onRetry,
    }, busy ? 'Enviando…' : tone === 'off' ? 'Publicar' : 'Reintentar'),
  );
}

export default function DifusionTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('errores');
  const [group, setGroup] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState({});
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProperties({ limit: 500, offset: 0, order: 'DESC', summary: 1 });
      setRows((data?.objects || []).filter((p) => p.summary));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const publishable = useMemo(() => rows.filter((p) => PUBLISHABLE.includes(p.status)), [rows]);

  const counts = useMemo(() => {
    const c = { todas: publishable.length, errores: 0, sin_ml: 0, sin_zp: 0, pausadas: 0, ok: 0 };
    publishable.forEach((p) => {
      const { ml, zp } = p.summary.channels;
      if (ml.state === 'error' || zp.state === 'error') c.errores += 1;
      if (ml.state === 'off') c.sin_ml += 1;
      if (zp.state === 'off') c.sin_zp += 1;
      if (['paused', 'review'].includes(ml.state) || ['paused', 'review'].includes(zp.state)) c.pausadas += 1;
      if (ml.state === 'on' && zp.state === 'on') c.ok += 1;
    });
    return c;
  }, [publishable]);

  // Errores agrupados por motivo, con cuántas propiedades tiene cada uno
  const groups = useMemo(() => {
    const map = new Map();
    publishable.forEach((p) => {
      [['MercadoLibre', p.summary.channels.ml], ['ZonaProp', p.summary.channels.zp]].forEach(([portal, ch]) => {
        if (ch.state !== 'error') return;
        const key = `${portal}: ${errorKey(ch.detail)}`;
        const g = map.get(key) || { key, portal, text: ch.detail || 'Error sin detalle', ids: new Set() };
        g.ids.add(p.id);
        map.set(key, g);
      });
    });
    return [...map.values()].sort((a, b) => b.ids.size - a.ids.size);
  }, [publishable]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = publishable;
    if (group) {
      const g = groups.find((x) => x.key === group);
      list = list.filter((p) => g?.ids.has(p.id));
    } else if (filter !== 'todas') {
      list = list.filter((p) => {
        const { ml, zp } = p.summary.channels;
        if (filter === 'errores') return ml.state === 'error' || zp.state === 'error';
        if (filter === 'sin_ml') return ml.state === 'off';
        if (filter === 'sin_zp') return zp.state === 'off';
        if (filter === 'pausadas') return ['paused', 'review'].includes(ml.state) || ['paused', 'review'].includes(zp.state);
        if (filter === 'ok') return ml.state === 'on' && zp.state === 'on';
        return true;
      });
    }
    if (term) list = list.filter((p) => `${p.id} ${p.publication_title || ''} ${p.address || ''}`.toLowerCase().includes(term));
    return list;
  }, [publishable, filter, group, groups, q]);

  async function retry(p, portal) {
    const k = `${p.id}-${portal}`;
    setBusy((b) => ({ ...b, [k]: true }));
    setFlash('');
    try {
      if (portal === 'ml') await syncPropertyMercadoLibre(p.id);
      else await syncPropertyZonaProp(p.id);
      setFlash(`#${p.id} enviada a ${portal === 'ml' ? 'MercadoLibre' : 'ZonaProp'}. El estado se actualiza en unos segundos.`);
      setTimeout(load, 4000);
    } catch (err) {
      setFlash(`#${p.id}: ${err.message || 'no se pudo enviar'}`);
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  }

  return e('section', { className: 'dt' },
    e('div', { className: 'dt-head' },
      e('div', null,
        e('h2', null, 'Dónde está publicada cada propiedad'),
        e('p', null, `${publishable.length} propiedades disponibles o reservadas. Se publican solas cuando cambia algo que el portal muestra.`),
      ),
      e('input', {
        className: 'dt-search', type: 'search', placeholder: 'Buscar por ID o dirección', value: q,
        onChange: (ev) => setQ(ev.target.value), 'aria-label': 'Buscar propiedad',
      }),
    ),

    groups.length > 0 && e('div', { className: 'dt-groups' },
      e('div', { className: 'dt-groups-title' }, e(Icons.AlertTriangle, { width: 14, height: 14 }), 'Errores por motivo'),
      groups.slice(0, 6).map((g) => e('button', {
        key: g.key, type: 'button', className: `dt-group${group === g.key ? ' on' : ''}`,
        onClick: () => setGroup(group === g.key ? null : g.key), title: g.text,
      },
        e('b', null, g.ids.size),
        e('span', { className: 'dt-group-portal' }, g.portal),
        e('span', { className: 'dt-group-text' }, g.text),
      )),
    ),

    e('div', { className: 'dt-filters', role: 'tablist' },
      FILTERS.map((f) => e('button', {
        key: f.key, type: 'button', role: 'tab', 'aria-selected': !group && filter === f.key,
        className: `dt-filter${!group && filter === f.key ? ' on' : ''}`,
        onClick: () => { setGroup(null); setFilter(f.key); },
      }, f.label, e('span', null, counts[f.key]))),
    ),

    flash && e('div', { className: 'dt-flash' }, flash),

    loading
      ? e('div', { className: 'dt-empty' }, 'Cargando propiedades…')
      : visible.length === 0
        ? e('div', { className: 'dt-empty' }, filter === 'errores' && !group ? 'Ninguna propiedad con errores en los portales.' : 'No hay propiedades en este filtro.')
        : e('div', { className: 'dt-table', role: 'table' },
            e('div', { className: 'dt-row dt-row-head', role: 'row' },
              e('span', null, 'Propiedad'), e('span', null, 'Web'), e('span', null, 'MercadoLibre'), e('span', null, 'ZonaProp'), e('span', null, 'Ficha'),
            ),
            visible.map((p) => {
              const ch = p.summary.channels;
              const src = thumb(p);
              return e('div', { key: p.id, className: 'dt-row', role: 'row' },
                e('a', { className: 'dt-prop', href: `/propiedades/${p.id}`, target: '_blank', rel: 'noopener' },
                  src ? e('img', { src, alt: '', loading: 'lazy' }) : e('span', { className: 'dt-noimg' }),
                  e('span', { className: 'dt-prop-text' },
                    e('b', null, p.publication_title || p.address || `Propiedad ${p.id}`),
                    e('small', null, `#${p.id} · ${STATUS_LABELS[p.status] || p.status}`),
                  ),
                ),
                e('div', { className: `dt-ch ${ch.web.on ? 'on' : 'off'}` }, e('div', { className: 'dt-ch-top' }, e('b', null, 'Web'), e('span', null, ch.web.on ? 'Se ve' : 'Oculta'))),
                e(Chip, { name: 'ML', ch: ch.ml, busy: busy[`${p.id}-ml`], onRetry: () => retry(p, 'ml') }),
                e(Chip, { name: 'ZP', ch: ch.zp, busy: busy[`${p.id}-zp`], onRetry: () => retry(p, 'zp') }),
                e('span', { className: `dt-health ${p.summary.health.percent >= 100 ? 'ok' : p.summary.health.percent >= 60 ? 'mid' : 'low'}`, title: p.summary.health.missing.map((m) => m.label).join(' · ') || 'Completa' },
                  `${p.summary.health.percent}%`),
              );
            }),
          ),
  );
}
