'use client';
import React from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Hoy from '../Dashboard/Hoy';
import Propiedades from '../Propiedades/Propiedades';
import AlquileresTemporarios from '../AlquileresTemporarios/AlquileresTemporarios';
import Consultas from '../Leads/Consultas';
import Archivos from '../Archivos/Archivos';
import Mostrador from '../Mostrador/Mostrador';
import Reportes from '../Reportes/Reportes';
import Difusion from '../Difusion/Difusion';
import Users from '../Users/Users';
import InstagramDM from '../InstagramDM/InstagramDM';
import MailMarketing from '../MailMarketing/MailMarketing';
import GlobalSearch from '../Search/GlobalSearch';
import './CRM.css';

const e = React.createElement;
const { useState, useEffect, useCallback } = React;

export default function CRM({ session, onLogout, initialTab, initialPerson }) {
  const [tab, setTab] = useState(initialTab || 'dashboard');
  const [searchOpen, setSearchOpen] = useState(false);
  const [personKey, setPersonKey] = useState(initialPerson || null);
  const SUPERADMIN_TABS = ['usuarios', 'mailmarketing'];
  const effectiveTab = SUPERADMIN_TABS.includes(tab) && session?.role !== 'SUPERADMIN' ? 'dashboard' : tab;

  // Ctrl K / ⌘K abre el buscador desde cualquier sección
  useEffect(() => {
    const onKey = (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === 'k') {
        ev.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openPerson = useCallback((key) => { setPersonKey(key); setTab('leads'); }, []);
  const goTab = useCallback((key) => { setPersonKey(null); setTab(key); }, []);

  const section = {
    dashboard: e(Hoy, { session, setTab }),
    propiedades: e(Propiedades, { session }),
    alquileres: e(AlquileresTemporarios, { session }),
    leads: e(Consultas, { session, initialPerson: personKey, key: personKey || 'inbox' }),
    archivos: e(Archivos, { session }),
    mostrador: e(Mostrador, { session }),
    reportes: e(Reportes, { session }),
    difusion: e(Difusion, { session }),
    usuarios: e(Users, { session }),
    instagram: e(InstagramDM, { session }),
    mailmarketing: e(MailMarketing, { session }),
  }[effectiveTab] || e(Hoy, { session, setTab });

  return e('div', { className: 'crm-root' },
    e(Sidebar, { tab: effectiveTab, setTab: goTab, session, onLogout, onOpenSearch: () => setSearchOpen(true) }),
    e('main', { className: 'crm-main' },
      e('div', { className: 'crm-section', key: effectiveTab }, section),
    ),
    e(GlobalSearch, { open: searchOpen, onClose: () => setSearchOpen(false), setTab: goTab, openPerson }),
  );
}
