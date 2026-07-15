'use client';
import React from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Dashboard from '../Dashboard/Dashboard';
import Propiedades from '../Propiedades/Propiedades';
import AlquileresTemporarios from '../AlquileresTemporarios/AlquileresTemporarios';
import Leads from '../Leads/Leads';
import Archivos from '../Archivos/Archivos';
import Reportes from '../Reportes/Reportes';
import './CRM.css';

const e = React.createElement;
const { useState } = React;

export default function CRM({ session, onLogout, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'dashboard');

  const section = {
    dashboard: e(Dashboard, { session }),
    propiedades: e(Propiedades, { session }),
    alquileres: e(AlquileresTemporarios, { session }),
    leads: e(Leads, { session }),
    archivos: e(Archivos, { session }),
    reportes: e(Reportes, { session }),
  }[tab] || e(Dashboard, { session });

  return e('div', { className: 'crm-root' },
    e(Sidebar, { tab, setTab, session, onLogout }),
    e('main', { className: 'crm-main' },
      e('div', { className: 'crm-section', key: tab }, section),
    ),
  );
}
