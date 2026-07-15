'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getActivities, getPropertyStats, getLeadStats } from '@/services/api';
import './Dashboard.css';

const e = React.createElement;
const { useState, useEffect } = React;

const FEED_TYPES = 'property_created,property_updated,lead_assigned';

const ACTIVITY_ICONS = {
  property_created: Icons.Building, property_updated: Icons.Edit, property_synced: Icons.RefreshCw,
  property_status_changed: Icons.Tag, lead_created: Icons.Mail, lead_updated: Icons.Edit,
  lead_status_changed: Icons.Tag, lead_assigned: Icons.User, user_login: Icons.User, sync_completed: Icons.RefreshCw,
};
const ACTIVITY_TYPE = {
  property_created: 'property', property_updated: 'property', property_synced: 'property',
  property_status_changed: 'property', lead_created: 'lead', lead_updated: 'lead',
  lead_status_changed: 'lead', lead_assigned: 'lead', user_login: 'user', sync_completed: 'system',
};
const STATUS_LABELS = {
  disponible: 'Disponibles', reservada: 'Reservadas', vendida: 'Vendidas', en_tasacion: 'En tasación', no_disponible: 'No disp.',
};
const STATUS_COLORS = {
  disponible: '#15784f', reservada: '#b8791b', vendida: '#d8504a', en_tasacion: '#7257c9', no_disponible: '#8a978f',
};
const LEAD_STATUS_LABELS = {
  nuevo: 'Nuevos', en_progreso: 'En progreso', contactado: 'Contactados', reservado: 'Reservados', cerrado: 'Cerrados', descartado: 'Descartados',
};
const LEAD_STATUS_COLORS = {
  nuevo: '#2563eb', en_progreso: '#b8791b', contactado: '#15784f', reservado: '#7257c9', cerrado: '#0e8a8a', descartado: '#8a978f',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `Hace ${hs}h`;
  const days = Math.floor(hs / 24);
  if (days < 7) return `Hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-AR');
}

function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor }) {
  return e('div', { className: 'stat-card' },
    e('div', { className: 'stat-card-top' },
      e('span', { className: 'stat-card-label' }, label),
      e('span', { className: 'stat-card-icon', style: { background: iconBg, color: iconColor } }, e(Icon, { width: 16, height: 16 })),
    ),
    e('div', { className: 'stat-card-value' }, value ?? '—'),
    sub ? e('div', { className: 'stat-card-sub' }, sub) : null,
  );
}

export default function Dashboard({ session }) {
  const [activities, setActivities] = useState([]);
  const [propStats, setPropStats] = useState(null);
  const [leadStats, setLeadStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([getActivities({ limit: 60, type: FEED_TYPES }), getPropertyStats(), getLeadStats()])
      .then(([acts, props, leads]) => {
        if (!active) return;
        setActivities(acts?.objects || []);
        setPropStats(props);
        setLeadStats(leads);
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const propTotal = propStats?.total ?? 0;
  const leadTotal = leadStats?.total ?? 0;
  const newLeads = leadStats?.byStatus?.find((s) => s._id === 'nuevo')?.count ?? 0;

  const propByStatus = Object.fromEntries((propStats?.byStatus || []).map((s) => [s._id, s.count]));
  const leadByStatus = Object.fromEntries((leadStats?.byStatus || []).map((s) => [s._id, s.count]));

  return e('div', { className: 'dashboard' },
    e('div', { className: 'dash-header' },
      e('h1', null, `Buenas, ${session?.name?.split(' ')[0] ?? 'equipo'}`),
      e('p', null, `Resumen de actividad · ${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`),
    ),

    e('div', { className: 'dash-stats' },
      e(StatCard, { label: 'Propiedades', value: propTotal, sub: 'en base de datos', icon: Icons.Building, iconBg: '#e7f4ee', iconColor: '#15784f' }),
      e(StatCard, { label: 'Leads totales', value: leadTotal, sub: 'en seguimiento', icon: Icons.Mail, iconBg: '#eff6ff', iconColor: '#2563eb' }),
      e(StatCard, { label: 'Leads nuevos', value: newLeads, sub: 'sin contactar', icon: Icons.Bell, iconBg: '#fef3e2', iconColor: '#b8791b' }),
      e(StatCard, { label: 'Disponibles', value: propByStatus.disponible ?? 0, sub: 'propiedades activas', icon: Icons.Tag, iconBg: '#e7f4ee', iconColor: '#15784f' }),
    ),

    e('div', { className: 'dash-cols' },

      // Feed
      e('div', { className: 'feed-card' },
        e('div', { className: 'feed-head' },
          e('h2', null, 'Actividad reciente'),
          e('div', { className: 'feed-head-right' },
            e('span', { style: { fontSize: 12, color: 'var(--ink-3)' } }, `${activities.length} eventos`),
          ),
        ),
        loading
          ? e('div', { className: 'feed-empty' }, 'Cargando actividad…')
          : activities.length === 0
            ? e('div', { className: 'feed-empty' }, 'No hay actividad registrada aún.')
            : e('div', { className: 'feed-list' },
                activities.map((act) => {
                  const Ico = ACTIVITY_ICONS[act.type] || Icons.Activity;
                  const cls = ACTIVITY_TYPE[act.type] || 'system';
                  return e('div', { key: act._id, className: 'feed-item' },
                    e('div', { className: `feed-icon ${cls}` }, e(Ico, { width: 14, height: 14 })),
                    e('div', { className: 'feed-content' },
                      e('div', { className: 'feed-desc' }, act.description),
                      e('div', { className: 'feed-time' }, timeAgo(act.createdAt)),
                    ),
                  );
                }),
              ),
      ),

      // Quick stats
      e('div', { className: 'dash-quick-stats' },

        e('div', { className: 'quick-card' },
          e('h3', null, 'Propiedades por estado'),
          propTotal === 0
            ? e('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Sin datos aún')
            : Object.entries(STATUS_LABELS).map(([key, label]) => {
                const count = propByStatus[key] || 0;
                const pct = propTotal > 0 ? (count / propTotal) * 100 : 0;
                return e('div', { key, className: 'status-bar-item' },
                  e('span', { className: 'status-bar-label' }, label),
                  e('div', { className: 'status-bar-track' }, e('div', { className: 'status-bar-fill', style: { width: `${pct}%`, background: STATUS_COLORS[key] } })),
                  e('span', { className: 'status-bar-count' }, count),
                );
              }),
        ),

        e('div', { className: 'quick-card' },
          e('h3', null, 'Leads por estado'),
          leadTotal === 0
            ? e('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Sin datos aún')
            : Object.entries(LEAD_STATUS_LABELS).map(([key, label]) => {
                const count = leadByStatus[key] || 0;
                const pct = leadTotal > 0 ? (count / leadTotal) * 100 : 0;
                return e('div', { key, className: 'status-bar-item' },
                  e('span', { className: 'status-bar-label' }, label),
                  e('div', { className: 'status-bar-track' }, e('div', { className: 'status-bar-fill', style: { width: `${pct}%`, background: LEAD_STATUS_COLORS[key] } })),
                  e('span', { className: 'status-bar-count' }, count),
                );
              }),
        ),
      ),
    ),
  );
}
