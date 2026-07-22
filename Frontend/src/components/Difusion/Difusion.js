'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getMercadoLibreSummary, syncAllMercadoLibre, getZonaPropSummary } from '@/services/api';
import './Difusion.css';

const e = React.createElement;
const { useState, useEffect, useCallback } = React;

function StatTile({ label, value }) {
  return e('div', { className: 'difusion-stat-tile' },
    e('div', { className: 'difusion-stat-label' }, label),
    e('div', { className: 'difusion-stat-value' }, (value ?? 0).toLocaleString('es-AR')),
  );
}

function MercadoLibreDifusionCard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getMercadoLibreSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
              e(StatTile, { label: 'Publicaciones simples', value: summary.publicaciones_simples }),
              e(StatTile, { label: 'Publicaciones premium', value: summary.publicaciones_premium }),
              e(StatTile, { label: 'Alertas a revisar', value: summary.alertas_a_revisar }),
              e(StatTile, { label: 'Errores (no publicadas)', value: summary.errores }),
            ),
            e('div', { className: 'difusion-stats-row difusion-stats-row-secondary' },
              e(StatTile, { label: 'Propiedades publicadas', value: summary.propiedades_publicadas }),
              e(StatTile, { label: 'Propiedades sin publicar', value: summary.propiedades_sin_publicar }),
            ),
          ),
  );
}

function ZonaPropDifusionCard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getZonaPropSummary().then(setSummary).catch(() => setSummary(null)).finally(() => setLoading(false));
  }, []);

  return e('div', { className: 'difusion-portal-card', style: { '--difusion-accent': '#00b4f0' } },
    e('div', { className: 'difusion-portal-head' },
      e('div', { className: 'difusion-portal-title' },
        e('div', { className: 'difusion-portal-name' }, 'ZonaProp'),
        e('div', { className: 'difusion-portal-sub' }, 'Publicación manual por propiedad'),
      ),
    ),
    loading
      ? e('div', { className: 'difusion-portal-loading' }, 'Cargando…')
      : !summary
        ? e('div', { className: 'difusion-portal-loading' }, 'No se pudo cargar el resumen.')
        : e('div', null,
            e('div', { className: 'difusion-portal-warning' },
              e(Icons.AlertTriangle, { width: 14, height: 14 }),
              'Todavía no hay sincronización automática — activá "Publicada" desde la tab Difusión de cada propiedad.',
            ),
            e('div', { className: 'difusion-stats-row difusion-stats-row-secondary' },
              e(StatTile, { label: 'Propiedades publicadas', value: summary.propiedades_publicadas }),
              e(StatTile, { label: 'Propiedades sin publicar', value: summary.propiedades_sin_publicar }),
            ),
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
