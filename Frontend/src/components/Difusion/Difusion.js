'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getMercadoLibreSummary, syncAllMercadoLibre, getMercadoLibreSummaryProperties } from '@/services/api';
import { photoSrc } from '@/lib/data';
import './Difusion.css';

const e = React.createElement;
const { useState, useEffect, useCallback } = React;

const TIER_LABELS = { silver: 'Plata', gold: 'Oro', gold_premium: 'Oro Premium' };
const OPERATION_LABELS = { venta: 'Venta', alquiler: 'Alquiler' };

const FILTER_TITLES = {
  simples: 'Publicaciones simples',
  premium: 'Publicaciones premium',
  alertas: 'Alertas a revisar',
  errores: 'Errores (no publicadas)',
};

function qualityTone(pct) {
  if (pct == null) return 'unknown';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

function StatTile({ label, value, filter, active, onClick }) {
  const clickable = !!filter;
  return e(clickable ? 'button' : 'div', {
    type: clickable ? 'button' : undefined,
    className: `difusion-stat-tile${clickable ? ' clickable' : ''}${active ? ' active' : ''}`,
    onClick: clickable ? () => onClick(filter) : undefined,
  },
    e('div', { className: 'difusion-stat-label' }, label),
    e('div', { className: 'difusion-stat-value' }, (value ?? 0).toLocaleString('es-AR')),
  );
}

function MercadoLibrePropertyRow({ item }) {
  const [showRecs, setShowRecs] = useState(false);
  const tone = qualityTone(item.health_percentage);
  const actions = item.health_actions || [];
  const src = photoSrc(item.photo);

  return e(React.Fragment, null,
    e('tr', { className: 'difusion-list-tr' },
      e('td', { className: 'difusion-list-td-img' },
        src
          ? e('img', { src, alt: '', className: 'difusion-list-thumb' })
          : e('div', { className: 'difusion-list-thumb difusion-list-thumb-empty' }),
      ),
      e('td', null, item.type_name || '—'),
      e('td', null, item.reference_code || '—'),
      e('td', null, item.location_name || '—'),
      e('td', { className: 'difusion-list-td-address' },
        item.address || item.publication_title || `Propiedad #${item.propertyId}`,
        e('div', { className: 'difusion-list-row-badges' },
          e('span', { className: 'difusion-badge' }, OPERATION_LABELS[item.operation_type] || item.operation_type),
          item.listing_type_id && e('span', { className: 'difusion-badge' }, TIER_LABELS[item.listing_type_id] || item.listing_type_id),
          item.url && e('a', {
            href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'btn ghost xs', title: 'Ver aviso',
          }, e(Icons.ExternalLink, { width: 12, height: 12 })),
        ),
      ),
      e('td', { className: 'difusion-list-td-quality' },
        item.health_percentage != null
          ? e(React.Fragment, null,
              e('div', { className: 'difusion-list-quality-head' },
                e('span', { className: `difusion-list-quality-pct tone-${tone}` }, `${item.health_percentage}%`),
                actions.length > 0 && e('button', {
                  type: 'button', className: 'btn ghost xs', onClick: () => setShowRecs((v) => !v),
                }, `${showRecs ? 'Ocultar' : 'Ver'} qué falta (${actions.length})`),
              ),
              e('div', { className: 'difusion-list-quality-bar' },
                e('div', { className: `difusion-list-quality-fill tone-${tone}`, style: { width: `${item.health_percentage}%` } }),
              ),
            )
          : item.last_error
            ? e('span', { className: 'difusion-list-error' }, item.last_error)
            : e('span', { className: 'difusion-list-quality-pct tone-unknown' }, '—'),
      ),
    ),
    showRecs && actions.length > 0 && e('tr', { className: 'difusion-list-tr-recs' },
      e('td', { colSpan: 6 },
        e('div', { className: 'difusion-list-goals' },
          e('div', { className: 'difusion-list-goals-title' },
            `Calidad de tu publicación · ${actions.length} ${actions.length === 1 ? 'objetivo por lograr' : 'objetivos por lograr'}`,
          ),
          actions.map((a, i) => e('div', { key: a.id || i, className: 'difusion-list-goal-card' },
            e('div', { className: 'difusion-list-goal-text' },
              e('div', { className: 'difusion-list-goal-title' }, a.title),
              a.description && e('div', { className: 'difusion-list-goal-desc' }, a.description),
            ),
            a.cta && e('span', { className: 'difusion-list-goal-cta' }, a.cta),
          )),
        ),
      ),
    ),
  );
}

function MercadoLibrePropertiesPanel({ filter }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setItems(null);
    getMercadoLibreSummaryProperties(filter)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return e('div', { className: 'difusion-list-panel' },
    e('div', { className: 'difusion-list-panel-title' }, FILTER_TITLES[filter] || filter),
    loading
      ? e('div', { className: 'difusion-portal-loading' }, 'Cargando…')
      : !items?.length
        ? e('div', { className: 'difusion-portal-loading' }, 'No hay propiedades en esta categoría.')
        : e('div', { className: 'difusion-list-table-wrap' },
            e('table', { className: 'difusion-list-table' },
              e('thead', null,
                e('tr', null,
                  e('th', null, 'Imagen'),
                  e('th', null, 'Tipo'),
                  e('th', null, 'Cód. ref.'),
                  e('th', null, 'Ubicación'),
                  e('th', null, 'Dirección'),
                  e('th', null, 'Calidad'),
                ),
              ),
              e('tbody', null,
                items.map((item, i) => e(MercadoLibrePropertyRow, { key: `${item.propertyId}-${item.operation_type}-${i}`, item })),
              ),
            ),
          ),
  );
}

function MercadoLibreDifusionCard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getMercadoLibreSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleTileClick(filter) {
    setActiveFilter((prev) => (prev === filter ? null : filter));
  }

  async function handleSync() {
    if (!confirm('Esto va a publicar/actualizar TODAS las propiedades disponibles en MercadoLibre. ¿Continuar?')) return;
    setSyncing(true);
    try {
      await syncAllMercadoLibre();
      alert('Sync con MercadoLibre iniciado. Corre en segundo plano — revisá el feed de actividad para ver el resumen cuando termine.');
    } catch (err) {
      alert(err.message || 'No se pudo iniciar el sync con MercadoLibre.');
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  }

  return e('div', { className: 'difusion-portal-card', style: { '--difusion-accent': '#ffe600' } },
    e('div', { className: 'difusion-portal-head' },
      e('div', { className: 'difusion-portal-title' },
        e('div', { className: 'difusion-portal-name' }, 'MercadoLibre'),
        e('div', { className: 'difusion-portal-sub' }, 'Argentina'),
      ),
      e('button', {
        type: 'button', className: 'btn ghost sm', onClick: handleSync, disabled: syncing,
      }, e(Icons.RefreshCw, { width: 13, height: 13 }), syncing ? 'Sincronizando…' : 'Sincronizar MercadoLibre'),
    ),
    loading
      ? e('div', { className: 'difusion-portal-loading' }, 'Cargando…')
      : !summary
        ? e('div', { className: 'difusion-portal-loading' }, 'No se pudo cargar el resumen.')
        : e('div', null,
            !summary.connected && e('div', { className: 'difusion-portal-warning' },
              e(Icons.AlertTriangle, { width: 14, height: 14 }),
              'La cuenta de MercadoLibre todavía no está conectada — los números de abajo son sobre datos locales del CRM.',
            ),
            e('div', { className: 'difusion-stats-row' },
              e(StatTile, { label: 'Publicaciones simples', value: summary.publicaciones_simples, filter: 'simples', active: activeFilter === 'simples', onClick: handleTileClick }),
              e(StatTile, { label: 'Publicaciones premium', value: summary.publicaciones_premium, filter: 'premium', active: activeFilter === 'premium', onClick: handleTileClick }),
              e(StatTile, { label: 'Alertas a revisar', value: summary.alertas_a_revisar, filter: 'alertas', active: activeFilter === 'alertas', onClick: handleTileClick }),
              e(StatTile, { label: 'Errores (no publicadas)', value: summary.errores, filter: 'errores', active: activeFilter === 'errores', onClick: handleTileClick }),
            ),
            e('div', { className: 'difusion-stats-row difusion-stats-row-secondary' },
              e(StatTile, { label: 'Propiedades publicadas', value: summary.propiedades_publicadas }),
              e(StatTile, { label: 'Propiedades sin publicar', value: summary.propiedades_sin_publicar }),
            ),
            activeFilter && e(MercadoLibrePropertiesPanel, { filter: activeFilter }),
          ),
  );
}

export default function Difusion() {
  return e('div', { className: 'difusion-page' },
    e('div', { className: 'difusion-page-head' },
      e('h1', null, 'Difusión'),
      e('span', { className: 'difusion-page-sub' }, 'Estado de las publicaciones en portales externos'),
    ),
    e('div', { className: 'difusion-portals' },
      e(MercadoLibreDifusionCard),
    ),
  );
}
