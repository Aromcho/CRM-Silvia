'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import LineChart from '../UI/LineChart';
import { getPropertyMlMetrics } from '@/services/api';
import './MlStats.css';

const e = React.createElement;
const { useState, useEffect } = React;

const METRICS = [
  { key: 'visits', label: 'Visualizaciones', icon: Icons.Image },
  { key: 'questions', label: 'Preguntas', icon: Icons.Mail },
  { key: 'phoneViews', label: 'Teléfono', icon: Icons.Phone },
  { key: 'whatsapp', label: 'WhatsApp', icon: Icons.MessageCircle },
  { key: 'leads', label: 'Interesados', icon: Icons.User },
];

const DAY_OPTIONS = [
  { key: 7, label: '7 días' },
  { key: 30, label: '30 días' },
  { key: 90, label: '90 días' },
];

function StatTile({ label, value, active, onClick }) {
  return e('button', { type: 'button', className: `ml-stat-tile${active ? ' active' : ''}`, onClick },
    e('div', { className: 'ml-stat-label' }, label),
    e('div', { className: 'ml-stat-value' }, (value ?? 0).toLocaleString('es-AR')),
  );
}

export default function MlStats({ property }) {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState('visits');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPropertyMlMetrics(property.id, days)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData({ series: [], totals: {} }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [property.id, days]);

  const hasListing = (property.difusion?.mercadolibre?.listings || []).some((l) => l.item_id);

  if (!hasListing) {
    return e('div', { className: 'ml-stats-empty' },
      e(Icons.BarChart, { width: 28, height: 28 }),
      e('p', null, 'Todavía no se publicó esta propiedad en MercadoLibre.'),
      e('p', { className: 'ml-stats-empty-sub' }, 'Las estadísticas aparecen acá una vez que sincronizás y corre la primera recolección diaria.'),
    );
  }

  const series = (data?.series || []).map((d) => ({ date: d.date, value: d[metric] || 0 }));
  const totals = data?.totals || {};
  const noDataYet = !loading && series.length === 0;

  return e('div', { className: 'ml-stats' },
    e('div', { className: 'ml-stats-head' },
      e('div', { className: 'ml-stats-days' },
        DAY_OPTIONS.map((o) => e('button', {
          key: o.key, type: 'button',
          className: `ml-stats-day-btn${days === o.key ? ' active' : ''}`,
          onClick: () => setDays(o.key),
        }, o.label)),
      ),
    ),

    e('div', { className: 'ml-stats-tiles' },
      METRICS.map((m) => e(StatTile, {
        key: m.key, label: m.label, value: totals[m.key], active: metric === m.key, onClick: () => setMetric(m.key),
      })),
    ),

    noDataYet
      ? e('div', { className: 'ml-stats-empty' },
          e(Icons.RefreshCw, { width: 24, height: 24 }),
          e('p', null, 'Todavía no hay datos recolectados para este período.'),
          e('p', { className: 'ml-stats-empty-sub' }, 'La recolección corre una vez por día — volvé a revisar mañana.'),
        )
      : e('div', { className: 'ml-stats-chart-card' },
          e('h4', null, METRICS.find((m) => m.key === metric)?.label),
          e(LineChart, { data: series, valueLabel: METRICS.find((m) => m.key === metric)?.label.toLowerCase() }),
        ),
  );
}
