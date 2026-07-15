'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getPropertyStats, getLeadStats } from '@/services/api';
import './Reportes.css';

const e = React.createElement;
const { useState, useEffect } = React;

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

    e('div', { className: 'in-progress-banner' },
      e('div', { className: 'ip-icon' }, e(Icons.BarChart, { width: 28, height: 28 })),
      e('h2', { className: 'ip-title' }, 'Sección en construcción'),
      e('p', { className: 'ip-sub' }, 'Acá vas a poder ver métricas detalladas de propiedades, conversión de leads, rendimiento por portal y evolución de precios en el tiempo.'),
      e('div', { className: 'ip-chips' },
        ['Gráfico de conversión', 'Rendimiento por portal', 'Propiedades más vistas', 'Leads por mes', 'Precio promedio por zona'].map((label) =>
          e('span', { key: label, className: 'ip-chip' }, label),
        ),
      ),
    ),

    e('div', { className: 'preview-stats' },
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, propTotal), e('div', { className: 'preview-stat-label' }, 'Propiedades')),
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, disponibles), e('div', { className: 'preview-stat-label' }, 'Disponibles')),
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, leadTotal), e('div', { className: 'preview-stat-label' }, 'Leads totales')),
      e('div', { className: 'preview-stat' }, e('div', { className: 'preview-stat-num' }, leadNuevos), e('div', { className: 'preview-stat-label' }, 'Leads nuevos')),
    ),
  );
}
