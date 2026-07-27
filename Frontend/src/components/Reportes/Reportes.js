'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import LineChart from '../UI/LineChart';
import { getPropertyStats, getLeadStats, getMercadoLibreReports } from '@/services/api';
import './Reportes.css';

const e = React.createElement;
const { useState, useEffect, useCallback } = React;

const METRICS = [
  { key: 'visits', label: 'Visitas' },
  { key: 'questions', label: 'Preguntas' },
  { key: 'phoneViews', label: 'Teléfono' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'leads', label: 'Leads' },
];

const LEAD_TYPE_LABELS = {
  whatsapp: 'WhatsApp', question: 'Pregunta', call: 'Llamado', schedule: 'Visita agendada', quotation: 'Cotización',
};

const DAY_OPTIONS = [{ key: 7, label: '7 días' }, { key: 30, label: '30 días' }, { key: 90, label: '90 días' }];

function StatTile({ label, value, active, onClick }) {
  return e('button', { type: 'button', className: `rpt-stat-tile${active ? ' active' : ''}`, onClick },
    e('div', { className: 'rpt-stat-label' }, label),
    e('div', { className: 'rpt-stat-value' }, (value ?? 0).toLocaleString('es-AR')),
  );
}

// Comparar magnitud entre categorías con nombre → barras de un solo hue, ordenadas
// de mayor a menor, con el valor como etiqueta directa (no hace falta leyenda).
function LeadsByTypeBars({ leadsByType }) {
  const rows = Object.entries(leadsByType || {})
    .map(([key, value]) => ({ key, label: LEAD_TYPE_LABELS[key] || key, value }))
    .sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return e('div', { className: 'rpt-bars' },
    rows.map((r) => e('div', { key: r.key, className: 'rpt-bar-row' },
      e('div', { className: 'rpt-bar-label' }, r.label),
      e('div', { className: 'rpt-bar-track' },
        e('div', { className: 'rpt-bar-fill', style: { width: `${(r.value / max) * 100}%` } }),
      ),
      e('div', { className: 'rpt-bar-value' }, r.value.toLocaleString('es-AR')),
    )),
  );
}

function TopPropertiesTable({ title, rows, valueKey, valueLabel }) {
  return e('div', { className: 'rpt-table-card' },
    e('h4', null, title),
    rows.length === 0
      ? e('p', { className: 'rpt-table-empty' }, 'Todavía no hay datos para este período.')
      : e('table', { className: 'rpt-table' },
          e('thead', null, e('tr', null,
            e('th', null, '#'), e('th', null, 'Propiedad'), e('th', null, valueLabel), e('th', null, ''),
          )),
          e('tbody', null,
            rows.map((r, i) => e('tr', { key: r.propertyId },
              e('td', { className: 'rpt-table-rank' }, i + 1),
              e('td', null, r.publication_title || r.address || `Propiedad ${r.propertyId}`),
              e('td', { className: 'rpt-table-value' }, (r[valueKey] || 0).toLocaleString('es-AR')),
              e('td', null,
                e('a', {
                  href: `/propiedades/${r.propertyId}`, target: '_blank', rel: 'noopener',
                  className: 'rpt-table-link',
                }, e(Icons.ExternalLink, { width: 13, height: 13 })),
              ),
            )),
          ),
        ),
  );
}

function MercadoLibreReports() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState('visits');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((d) => {
    setLoading(true);
    getMercadoLibreReports(d)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const totals = data?.totals || {};
  const chartSeries = (data?.series || []).map((d) => ({ date: d.date, value: d[metric] || 0 }));
  const noDataYet = !loading && (data?.series || []).length === 0;

  return e('div', { className: 'rpt-section' },
    e('div', { className: 'rpt-section-head' },
      e('div', null,
        e('h2', null, 'MercadoLibre'),
        e('p', null, 'Visitas, contactos y leads de todas las publicaciones activas.'),
      ),
      e('div', { className: 'rpt-days' },
        DAY_OPTIONS.map((o) => e('button', {
          key: o.key, type: 'button', className: `rpt-day-btn${days === o.key ? ' active' : ''}`, onClick: () => setDays(o.key),
        }, o.label)),
      ),
    ),

    e('div', { className: 'rpt-stats-tiles' },
      METRICS.map((m) => e(StatTile, {
        key: m.key, label: m.label, value: totals[m.key], active: metric === m.key, onClick: () => setMetric(m.key),
      })),
    ),

    noDataYet
      ? e('div', { className: 'rpt-empty' },
          e(Icons.RefreshCw, { width: 24, height: 24 }),
          e('p', null, 'Todavía no hay datos recolectados para este período.'),
          e('p', { className: 'rpt-empty-sub' }, 'La recolección corre una vez por día — volvé a revisar mañana.'),
        )
      : e('div', { className: 'rpt-chart-card' },
          e('h4', null, `${METRICS.find((m) => m.key === metric)?.label} por día`),
          e(LineChart, { data: chartSeries, valueLabel: METRICS.find((m) => m.key === metric)?.label.toLowerCase() }),
        ),

    e('div', { className: 'rpt-grid-2' },
      e('div', { className: 'rpt-table-card' },
        e('h4', null, 'Leads por tipo de contacto'),
        e(LeadsByTypeBars, { leadsByType: data?.leadsByType }),
      ),
      e(TopPropertiesTable, { title: 'Más visitadas', rows: data?.topByVisits || [], valueKey: 'visits', valueLabel: 'Visitas' }),
    ),

    e(TopPropertiesTable, { title: 'Más leads', rows: data?.topByLeads || [], valueKey: 'leads', valueLabel: 'Leads' }),
  );
}

export default function Reportes() {
  const [propStats, setPropStats] = useState(null);
  const [leadStats, setLeadStats] = useState(null);

  useEffect(() => {
    Promise.all([getPropertyStats(), getLeadStats()])
      .then(([p, l]) => { setPropStats(p); setLeadStats(l); })
      .catch(console.error);
  }, []);

  const propTotal = propStats?.total ?? '—';
  const leadTotal = leadStats?.total ?? '—';
  const disponibles = propStats?.byStatus?.find((s) => s._id === 'disponible')?.count ?? '—';
  const leadNuevos = leadStats?.byStatus?.find((s) => s._id === 'nuevo')?.count ?? '—';

  return e('div', { className: 'reportes' },
    e('div', { className: 'reportes-header' },
      e('h1', null, 'Reportes'),
      e('p', null, 'Métricas y análisis del negocio'),
    ),

    e('div', { className: 'preview-stats' },
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, propTotal), e('div', { className: 'preview-stat-label' }, 'Propiedades')),
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, disponibles), e('div', { className: 'preview-stat-label' }, 'Disponibles')),
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, leadTotal), e('div', { className: 'preview-stat-label' }, 'Leads totales')),
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, leadNuevos), e('div', { className: 'preview-stat-label' }, 'Leads nuevos')),
    ),

    e(MercadoLibreReports),
  );
}
