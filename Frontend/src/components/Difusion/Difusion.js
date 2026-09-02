'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import {
  getMercadoLibreSummary, syncAllMercadoLibre, getMercadoLibreSummaryProperties,
  getZonaPropSummary, syncAllZonaProp, getZonaPropSummaryProperties, reconcileZonaProp,
  configureZonaPropCallbacks,
} from '@/services/api';
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

const ZP_PLAN_LABELS = { SIMPLE: 'Simple', DESTACADO: 'Destacado', HOME: 'Home' };
const ZP_FILTER_TITLES = {
  simples: 'Publicaciones simples',
  destacadas: 'Publicaciones destacadas',
  home: 'Publicaciones Home',
  errores: 'Errores (no publicadas)',
};

function formatZpFecha(ms) {
  if (!ms) return '';
  try { return new Date(Number(ms)).toLocaleDateString('es-AR'); } catch { return ''; }
}

// Créditos disponibles/por vencer por plan — viene de /v1/inmobiliarias/{cod}/disponibilidad
// (ver zonaprop.controller.js getZonaPropSummary). No tiene equivalente en la card de ML: ZonaProp
// vende cupos por plan (Simple/Destacado/Home), no es "publicá lo que quieras".
function ZonaPropCreditsPanel({ creditos }) {
  if (!creditos) {
    return e('div', { className: 'difusion-portal-warning' },
      e(Icons.AlertTriangle, { width: 14, height: 14 }),
      'No se pudieron consultar los créditos de ZonaProp ahora (puede estar fuera del horario de sandbox, Lu-Vi 07:00-20:55 ART).',
    );
  }
  const disponibles = creditos.disponibles || [];
  const vencimientos = creditos.vencimientos || [];
  const porPlan = ['SIMPLE', 'DESTACADO', 'HOME'].map((plan) => ({
    plan,
    disponible: disponibles.find((d) => d.planDePublicacion === plan)?.cantidadDisponible ?? 0,
    vence: vencimientos.filter((v) => v.planDePublicacion === plan),
  }));
  return e('div', { className: 'difusion-credits' },
    e('div', { className: 'difusion-credits-title' }, 'Créditos de ZonaProp'),
    e('div', { className: 'difusion-credits-row' },
      porPlan.map((p) => e('div', { key: p.plan, className: 'difusion-credit-card' },
        e('div', { className: 'difusion-credit-plan' }, ZP_PLAN_LABELS[p.plan] || p.plan),
        e('div', { className: 'difusion-credit-value' }, p.disponible.toLocaleString('es-AR')),
        e('div', { className: 'difusion-credit-label' }, 'disponibles'),
        p.vence.length > 0 && e('div', { className: 'difusion-credit-vence' },
          p.vence.map((v, i) => e('div', { key: i }, `${v.cantidad} vencen el ${formatZpFecha(v.fecha)}`)),
        ),
      )),
    ),
  );
}

function ZonaPropPropertyRow({ item }) {
  const [showWarnings, setShowWarnings] = useState(false);
  const src = photoSrc(item.photo);
  const warnings = item.warnings || [];
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
          item.tipoDePublicacion && e('span', { className: 'difusion-badge' }, item.tipoDePublicacion),
        ),
      ),
      e('td', { className: 'difusion-list-td-quality' },
        item.last_error
          ? e('span', { className: 'difusion-list-error' }, item.last_error)
          : e(React.Fragment, null,
              e('span', { className: 'difusion-list-quality-pct tone-good' }, item.estado || 'OK'),
              warnings.length > 0 && e('button', {
                type: 'button', className: 'btn ghost xs', onClick: () => setShowWarnings((v) => !v),
              }, `${showWarnings ? 'Ocultar' : 'Ver'} avisos (${warnings.length})`),
            ),
      ),
    ),
    showWarnings && warnings.length > 0 && e('tr', { className: 'difusion-list-tr-recs' },
      e('td', { colSpan: 6 },
        e('div', { className: 'difusion-list-goals' },
          warnings.map((w, i) => e('div', { key: i, className: 'difusion-list-goal-card' },
            e('div', { className: 'difusion-list-goal-text' },
              e('div', { className: 'difusion-list-goal-title' }, w.code),
              e('div', { className: 'difusion-list-goal-desc' }, w.message),
            ),
          )),
        ),
      ),
    ),
  );
}

function ZonaPropPropertiesPanel({ filter }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setItems(null);
    getZonaPropSummaryProperties(filter)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return e('div', { className: 'difusion-list-panel' },
    e('div', { className: 'difusion-list-panel-title' }, ZP_FILTER_TITLES[filter] || filter),
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
                  e('th', null, 'Estado'),
                ),
              ),
              e('tbody', null,
                items.map((item, i) => e(ZonaPropPropertyRow, { key: `${item.propertyId}-${i}`, item })),
              ),
            ),
          ),
  );
}

function ZonaPropDifusionCard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [configuringCallbacks, setConfiguringCallbacks] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getZonaPropSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleTileClick(filter) {
    setActiveFilter((prev) => (prev === filter ? null : filter));
  }

  async function handleSync() {
    if (!confirm('Esto va a publicar/actualizar TODAS las propiedades disponibles en ZonaProp. ¿Continuar?')) return;
    setSyncing(true);
    try {
      await syncAllZonaProp();
      alert('Sync con ZonaProp iniciado. Corre en segundo plano — revisá el feed de actividad para ver el resumen cuando termine.');
    } catch (err) {
      alert(err.message || 'No se pudo iniciar el sync con ZonaProp.');
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  }

  async function handleReconcile() {
    setReconciling(true);
    try {
      const result = await reconcileZonaProp();
      alert(`Reconciliación completa: ${result.linked} avisos vinculados nuevos, ${result.alreadyLinked} ya estaban vinculados, ${result.unmatched.length} sin match (de ${result.total} avisos online en ZonaProp).`);
      load();
    } catch (err) {
      alert(err.message || 'No se pudo reconciliar con ZonaProp.');
    } finally {
      setReconciling(false);
    }
  }

  async function handleConfigureCallbacks() {
    if (!confirm('Esto configura en ZonaProp la URL pública de este servidor para recibir leads y novedades de estado en tiempo real. Solo hace falta correrlo una vez por ambiente (sandbox/producción). ¿Continuar?')) return;
    setConfiguringCallbacks(true);
    try {
      const result = await configureZonaPropCallbacks();
      alert(`Callbacks configurados: ${result.url}\nSuscripto a: ${(result.subscribed || []).join(', ')}`);
    } catch (err) {
      alert(err.message || 'No se pudieron configurar los callbacks de ZonaProp.');
    } finally {
      setConfiguringCallbacks(false);
    }
  }

  return e('div', { className: 'difusion-portal-card', style: { '--difusion-accent': '#8bc53f' } },
    e('div', { className: 'difusion-portal-head' },
      e('div', { className: 'difusion-portal-title' },
        e('div', { className: 'difusion-portal-name' }, 'ZonaProp'),
        e('div', { className: 'difusion-portal-sub' }, 'Argentina'),
      ),
      e('div', { className: 'difusion-portal-actions' },
        e('button', {
          type: 'button', className: 'btn ghost sm', onClick: handleConfigureCallbacks, disabled: configuringCallbacks,
          title: 'Registra en ZonaProp la URL pública de este servidor para recibir leads y novedades — correr una sola vez por ambiente',
        }, configuringCallbacks ? 'Configurando…' : 'Configurar callbacks'),
        e('button', {
          type: 'button', className: 'btn ghost sm', onClick: handleReconcile, disabled: reconciling,
          title: 'Vincula avisos que ya existen en ZonaProp (ej. sindicados por Tokko) con las propiedades del CRM, sin duplicarlos',
        }, reconciling ? 'Reconciliando…' : 'Reconciliar existentes'),
        e('button', {
          type: 'button', className: 'btn ghost sm', onClick: handleSync, disabled: syncing,
        }, e(Icons.RefreshCw, { width: 13, height: 13 }), syncing ? 'Sincronizando…' : 'Sincronizar ZonaProp'),
      ),
    ),
    loading
      ? e('div', { className: 'difusion-portal-loading' }, 'Cargando…')
      : !summary
        ? e('div', { className: 'difusion-portal-loading' }, 'No se pudo cargar el resumen.')
        : e('div', null,
            e('div', { className: 'difusion-stats-row' },
              e(StatTile, { label: 'Publicaciones simples', value: summary.publicaciones_simples, filter: 'simples', active: activeFilter === 'simples', onClick: handleTileClick }),
              e(StatTile, { label: 'Publicaciones destacadas', value: summary.publicaciones_destacadas, filter: 'destacadas', active: activeFilter === 'destacadas', onClick: handleTileClick }),
              e(StatTile, { label: 'Publicaciones Home', value: summary.publicaciones_home, filter: 'home', active: activeFilter === 'home', onClick: handleTileClick }),
              e(StatTile, { label: 'Errores (no publicadas)', value: summary.errores, filter: 'errores', active: activeFilter === 'errores', onClick: handleTileClick }),
            ),
            e('div', { className: 'difusion-stats-row difusion-stats-row-secondary' },
              e(StatTile, { label: 'Propiedades publicadas', value: summary.propiedades_publicadas }),
              e(StatTile, { label: 'Propiedades sin publicar', value: summary.propiedades_sin_publicar }),
            ),
            e(ZonaPropCreditsPanel, { creditos: summary.creditos }),
            activeFilter && e(ZonaPropPropertiesPanel, { filter: activeFilter }),
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
      e(ZonaPropDifusionCard),
    ),
  );
}
