'use client';
import React from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Dashboard from '../Dashboard/Dashboard';
import Propiedades from '../Propiedades/Propiedades';
import AlquileresTemporarios from '../AlquileresTemporarios/AlquileresTemporarios';
import Leads from '../Leads/Leads';
import Archivos from '../Archivos/Archivos';
import Mostrador from '../Mostrador/Mostrador';
import Reportes from '../Reportes/Reportes';
import Difusion from '../Difusion/Difusion';
import Users from '../Users/Users';
import './CRM.css';

const e = React.createElement;
const { useState } = React;

export default function CRM({ session, onLogout, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'dashboard');
  const effectiveTab = tab === 'usuarios' && session?.role !== 'SUPERADMIN' ? 'dashboard' : tab;

  const section = {
    dashboard: e(Dashboard, { session }),
    propiedades: e(Propiedades, { session }),
    alquileres: e(AlquileresTemporarios, { session }),
    leads: e(Leads, { session }),
    archivos: e(Archivos, { session }),
    mostrador: e(Mostrador, { session }),
    reportes: e(Reportes, { session }),
    difusion: e(Difusion, { session }),
    usuarios: e(Users, { session }),
  }[effectiveTab] || e(Dashboard, { session });

  return e('div', { className: 'crm-root' },
    e(Sidebar, { tab: effectiveTab, setTab, session, onLogout }),
    e('main', { className: 'crm-main' },
      e('div', { className: 'crm-section', key: effectiveTab }, section),
    ),
  );
}
