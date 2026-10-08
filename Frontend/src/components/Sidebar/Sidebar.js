'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import Avatar from '../UI/Avatar';
import { logout } from '@/services/api';
import './Sidebar.css';

const e = React.createElement;
const { useState, useEffect } = React;

// `short`: etiqueta del riel de tablet y de la barra del celular. `mobile`: va fija en la barra de
// abajo del celular; el resto queda en "Más".
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', short: 'Inicio', icon: Icons.Activity, mobile: true },
  { key: 'propiedades', label: 'Propiedades', short: 'Propiedades', icon: Icons.Building, mobile: true },
  { key: 'alquileres', label: 'Alquileres temporarios', short: 'Alquileres', icon: Icons.Calendar, mobile: true },
  { key: 'leads', label: 'Consultas', short: 'Consultas', icon: Icons.Mail, mobile: true },
  { key: 'archivos', label: 'Archivos', short: 'Archivos', icon: Icons.Folder },
  { key: 'mostrador', label: 'Mostrador', short: 'Mostrador', icon: Icons.Printer },
  { key: 'reportes', label: 'Reportes', short: 'Reportes', icon: Icons.BarChart },
  { key: 'difusion', label: 'Difusión', short: 'Difusión', icon: Icons.Globe },
  { key: 'usuarios', label: 'Usuarios', short: 'Usuarios', icon: Icons.Users, superAdminOnly: true },
];

const AGENDA_URL = 'https://agenda.silviafernandezpropiedades.com.ar/';

export default function Sidebar({ tab, setTab, session, onLogout }) {
  const [moreOpen, setMoreOpen] = useState(false);

  async function handleLogout() {
    await logout();
    onLogout();
  }

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (ev) => { if (ev.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const roleLabel = session?.role === 'SUPERADMIN' ? 'Super Admin' : session?.role === 'ADMIN' ? 'Administrador' : 'Usuario';
  const items = NAV_ITEMS.filter((item) => !item.superAdminOnly || session?.role === 'SUPERADMIN');
  const extra = items.filter((item) => !item.mobile);
  const extraActive = extra.some((item) => item.key === tab);

  function go(key) {
    setMoreOpen(false);
    setTab(key);
  }

  return e(React.Fragment, null,
    e('aside', { className: 'sidebar' },
      // Logo
      e('div', { className: 'sidebar-logo' },
        e('div', { className: 'logo-mark' },
          e('div', { className: 'logo-icon' }, 'CRM'),
          e('div', { className: 'logo-words' },
            e('div', { className: 'logo-text' }, 'Inmobiliaria'),
            e('div', { className: 'logo-sub' }, 'Panel de gestión'),
          ),
        ),
      ),

      // Nav
      e('nav', { className: 'sidebar-nav', 'aria-label': 'Secciones' },
        e('div', { className: 'nav-section-label' }, 'Principal'),
        items.map((item) =>
          e('button', {
            key: item.key, type: 'button', title: item.label,
            className: `nav-item${tab === item.key ? ' active' : ''}${item.mobile ? '' : ' nav-extra'}`,
            'aria-current': tab === item.key ? 'page' : undefined,
            onClick: () => go(item.key),
          },
            e('span', { className: 'nav-icon' }, e(item.icon, { width: 16, height: 16 })),
            e('span', { className: 'nav-label' }, item.label),
            e('span', { className: 'nav-short' }, item.short),
          )
        ),
        // Solo en el celular: el resto de las secciones, la agenda y la sesión
        e('button', {
          type: 'button', className: `nav-item nav-more${extraActive || moreOpen ? ' active' : ''}`,
          'aria-expanded': moreOpen, 'aria-haspopup': 'dialog', onClick: () => setMoreOpen((v) => !v),
        },
          e('span', { className: 'nav-icon' }, e(Icons.More, { width: 18, height: 18 })),
          e('span', { className: 'nav-short' }, 'Más'),
        ),
      ),

      // Bottom
      e('div', { className: 'sidebar-bottom' },
        e('a', { className: 'sidebar-sync-btn', href: AGENDA_URL, target: '_blank', rel: 'noopener noreferrer', title: 'Ir a la agenda' },
          e(Icons.ExternalLink, { width: 14, height: 14 }),
          e('span', { className: 'nav-label' }, 'Ir a la agenda'),
        ),
        e('div', { className: 'sidebar-user' },
          e(Avatar, { email: session?.email, name: session?.name, size: 30 }),
          e('div', { className: 'sidebar-user-info' },
            e('div', { className: 'sidebar-user-name' }, session?.name),
            e('div', { className: 'sidebar-user-role' }, roleLabel),
          ),
          e('button', { className: 'logout-btn', onClick: handleLogout, title: 'Cerrar sesión', 'aria-label': 'Cerrar sesión' },
            e(Icons.LogOut, { width: 14, height: 14 }),
          ),
        ),
      ),
    ),

    moreOpen && e('div', { className: 'nav-sheet-overlay', onClick: () => setMoreOpen(false) },
      e('div', { className: 'nav-sheet', role: 'dialog', 'aria-label': 'Más secciones', onClick: (ev) => ev.stopPropagation() },
        e('div', { className: 'nav-sheet-grip' }),
        e('div', { className: 'nav-sheet-grid' },
          extra.map((item) => e('button', {
            key: item.key, type: 'button', className: `nav-sheet-item${tab === item.key ? ' active' : ''}`, onClick: () => go(item.key),
          }, e('span', { className: 'nav-sheet-icon' }, e(item.icon, { width: 18, height: 18 })), item.label)),
          e('a', { className: 'nav-sheet-item', href: AGENDA_URL, target: '_blank', rel: 'noopener noreferrer', onClick: () => setMoreOpen(false) },
            e('span', { className: 'nav-sheet-icon' }, e(Icons.ExternalLink, { width: 18, height: 18 })), 'Agenda'),
        ),
        e('div', { className: 'nav-sheet-user' },
          e(Avatar, { email: session?.email, name: session?.name, size: 36 }),
          e('div', { className: 'sidebar-user-info' },
            e('div', { className: 'nav-sheet-name' }, session?.name),
            e('div', { className: 'nav-sheet-role' }, roleLabel),
          ),
          e('button', { type: 'button', className: 'btn ghost sm', onClick: handleLogout }, e(Icons.LogOut, { width: 13, height: 13 }), 'Cerrar sesión'),
        ),
      ),
    ),
  );
}
