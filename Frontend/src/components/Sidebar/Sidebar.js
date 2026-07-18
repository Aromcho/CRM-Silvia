'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { logout, triggerSync, importRentals } from '@/services/api';
import './Sidebar.css';

const e = React.createElement;
const { useState } = React;

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: Icons.Activity, section: 'principal' },
  { key: 'propiedades', label: 'Propiedades', icon: Icons.Building, section: 'principal' },
  { key: 'alquileres', label: 'Alquileres temporarios', icon: Icons.Calendar, section: 'principal' },
  { key: 'leads', label: 'Consultas', icon: Icons.Mail, section: 'principal' },
  { key: 'archivos', label: 'Archivos', icon: Icons.Folder, section: 'principal' },
  { key: 'mostrador', label: 'Mostrador', icon: Icons.Printer, section: 'principal' },
  { key: 'reportes', label: 'Reportes', icon: Icons.BarChart, section: 'principal' },
  { key: 'usuarios', label: 'Usuarios', icon: Icons.Users, section: 'principal', superAdminOnly: true },
];

const AVATAR_PALETTE = ['#15784f', '#2563eb', '#b8791b', '#7257c9', '#0e8a8a', '#d8504a'];
function colorOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

export default function Sidebar({ tab, setTab, session, onLogout }) {
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  async function handleSync() {
    setSyncing(true);
    await triggerSync().catch(console.error);
    setTimeout(() => setSyncing(false), 3000);
  }

  async function handleImportRentals() {
    setImporting(true);
    try {
      const summary = await importRentals();
      alert(`Importación completada.\nPropiedades actualizadas: ${summary.updated}\nBloques sin ID: ${summary.unmatchedIds.length}`);
    } catch (err) {
      alert(err.message || 'No se pudo importar el Excel de alquileres.');
    } finally {
      setImporting(false);
    }
  }

  const userColor = colorOf(session?.email || session?.name || '');
  const userInitials = initials(session?.name || '?');
  const roleLabel = session?.role === 'SUPERADMIN' ? 'Super Admin' : session?.role === 'ADMIN' ? 'Administrador' : 'Usuario';

  return e('aside', { className: 'sidebar' },
    // Logo
    e('div', { className: 'sidebar-logo' },
      e('div', { className: 'logo-mark' },
        e('div', { className: 'logo-icon' }, 'CRM'),
        e('div', null,
          e('div', { className: 'logo-text' }, 'Inmobiliaria'),
          e('div', { className: 'logo-sub' }, 'Panel de gestión'),
        ),
      ),
    ),

    // Nav
    e('nav', { className: 'sidebar-nav' },
      e('div', { className: 'nav-section-label' }, 'Principal'),
      NAV_ITEMS.filter((item) => !item.superAdminOnly || session?.role === 'SUPERADMIN').map((item) =>
        e('button', {
          key: item.key,
          className: `nav-item${tab === item.key ? ' active' : ''}`,
          onClick: () => setTab(item.key),
        },
          e('span', { className: 'nav-icon' }, e(item.icon, { width: 16, height: 16 })),
          e('span', null, item.label),
        )
      ),
    ),

    // Bottom
    e('div', { className: 'sidebar-bottom' },
      ['ADMIN', 'SUPERADMIN'].includes(session?.role) &&
        e('button', { className: `sidebar-sync-btn${syncing ? ' syncing' : ''}`, onClick: handleSync },
          e(Icons.RefreshCw, { width: 14, height: 14 }),
          syncing ? 'Sincronizando…' : 'Sincronizar Tokko',
        ),
      ['ADMIN', 'SUPERADMIN'].includes(session?.role) &&
        e('button', { className: `sidebar-sync-btn${importing ? ' syncing' : ''}`, onClick: handleImportRentals, disabled: importing },
          e(Icons.FileText, { width: 14, height: 14 }),
          importing ? 'Importando…' : 'Importar alquileres (Excel)',
        ),
      e('div', { className: 'sidebar-user' },
        e('span', { className: 'avatar avatar-pop', style: { width: 30, height: 30, background: userColor, fontSize: 11 } }, userInitials),
        e('div', { className: 'sidebar-user-info' },
          e('div', { className: 'sidebar-user-name' }, session?.name),
          e('div', { className: 'sidebar-user-role' }, roleLabel),
        ),
        e('button', { className: 'logout-btn', onClick: handleLogout, title: 'Cerrar sesión' },
          e(Icons.LogOut, { width: 14, height: 14 }),
        ),
      ),
    ),
  );
}
