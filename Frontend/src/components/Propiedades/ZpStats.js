'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getLeads } from '@/services/api';
import './MlStats.css';

const e = React.createElement;
const { useState, useEffect } = React;

// ZonaProp (plan "API Free" actual) no expone visitas/contactos por aviso, a diferencia de
// MercadoLibre — el único dato real que tenemos es el lead en sí (por callback o polling), así
// que esto muestra sólo eso en vez de simular métricas que no existen.
export default function ZpStats({ property }) {
  const [leads, setLeads] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeads({ propertyId: property.id, source: 'zonaprop', limit: 20 })
      .then((res) => { if (!cancelled) setLeads(res?.objects || []); })
      .catch(() => { if (!cancelled) setLeads([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [property.id]);

  const isPublished = !!property.difusion?.zonaprop?.published;

  if (!isPublished) {
    return e('div', { className: 'ml-stats-empty' },
      e(Icons.BarChart, { width: 28, height: 28 }),
      e('p', null, 'Todavía no se publicó esta propiedad en ZonaProp.'),
    );
  }

  if (loading) return null;

  return e('div', { className: 'ml-stats' },
    e('div', { className: 'ml-stats-tiles' },
      e('div', { className: 'ml-stat-tile' },
        e('div', { className: 'ml-stat-label' }, 'Leads'),
        e('div', { className: 'ml-stat-value' }, leads.length.toLocaleString('es-AR')),
      ),
    ),

    leads.length === 0
      ? e('div', { className: 'ml-stats-empty' },
          e(Icons.RefreshCw, { width: 24, height: 24 }),
          e('p', null, 'Todavía no llegaron leads de ZonaProp para esta propiedad.'),
        )
      : e('div', { className: 'ml-stats-chart-card' },
          e('h4', null, 'Últimos leads de ZonaProp'),
          e('table', { className: 'rpt-table', style: { width: '100%' } },
            e('thead', null, e('tr', null,
              e('th', null, 'Fecha'), e('th', null, 'Nombre'), e('th', null, 'Contacto'), e('th', null, 'Mensaje'),
            )),
            e('tbody', null,
              leads.map((l) => e('tr', { key: l._id },
                e('td', null, new Date(l.createdAt).toLocaleDateString('es-AR')),
                e('td', null, l.name),
                e('td', null, l.phone || l.email || ''),
                e('td', null, l.message || ''),
              )),
            ),
          ),
        ),
  );
}
