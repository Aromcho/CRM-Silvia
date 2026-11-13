'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { globalSearch } from '@/services/api';
import { STATUS_LABELS } from '@/lib/data';
import './GlobalSearch.css';

// Buscador único (C13): Ctrl K o «Buscar» en el menú. Propiedades, personas que consultaron y
// reservas de temporada; sin texto, atajos a cada sección. Flechas + Enter para elegir.

const e = React.createElement;
const { useState, useEffect, useRef, useMemo } = React;

const SECTIONS = [
  { key: 'dashboard', label: 'Hoy' }, { key: 'leads', label: 'Consultas' }, { key: 'propiedades', label: 'Propiedades' },
  { key: 'alquileres', label: 'Alquileres' }, { key: 'difusion', label: 'Difusión' }, { key: 'instagram', label: 'Instagram' },
  { key: 'reportes', label: 'Reportes' }, { key: 'mostrador', label: 'Mostrador' },
];

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

export default function GlobalSearch({ open, onClose, setTab, openPerson }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ(''); setRes(null); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); setLoading(false); return undefined; }
    setLoading(true);
    const t = setTimeout(() => {
      globalSearch(term)
        .then((data) => { setRes(data); setActive(0); })
        .catch(() => setRes({ properties: [], people: [], bookings: [] }))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo(() => {
    if (!res) {
      return SECTIONS.filter((s) => !q.trim() || s.label.toLowerCase().includes(q.trim().toLowerCase()))
        .map((s) => ({ group: 'Ir a', key: `s-${s.key}`, title: s.label, sub: '', icon: Icons.Chevron, run: () => setTab(s.key) }));
    }
    const out = [];
    res.properties.forEach((p) => out.push({
      group: 'Propiedades', key: `p-${p.id}`, title: p.title, img: p.photo,
      sub: [`#${p.id}`, p.place && p.place.trim(), p.ops, STATUS_LABELS[p.status]].filter(Boolean).join(' · '),
      run: () => { window.location.href = `/propiedades/${p.id}`; },
    }));
    res.people.forEach((x) => out.push({
      group: 'Personas', key: `c-${x.key}`, title: x.name, icon: Icons.Users,
      sub: [x.phone, x.count > 1 ? `${x.count} consultas` : x.propertyTitle].filter(Boolean).join(' · '),
      run: () => openPerson(x.key),
    }));
    res.bookings.forEach((b, i) => out.push({
      group: 'Reservas', key: `b-${b.propertyId}-${i}`, title: `${b.guestName}`, icon: Icons.Calendar,
      sub: `${fmtDay(b.startDate)} al ${fmtDay(b.endDate)} · ${b.address}`,
      run: () => { window.location.href = `/propiedades/${b.propertyId}`; },
    }));
    return out;
  }, [res, q, setTab, openPerson]);

  function choose(item) {
    if (!item) return;
    onClose();
    item.run();
  }

  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); onClose(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); choose(items[active]); }
  }

  useEffect(() => {
    listRef.current?.querySelector('.gs-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  let lastGroup = null;
  return e('div', { className: 'gs-overlay', onMouseDown: onClose },
    e('div', { className: 'gs-box', role: 'dialog', 'aria-label': 'Buscar en el CRM', onMouseDown: (ev) => ev.stopPropagation() },
      e('div', { className: 'gs-input' },
        e(Icons.Search, { width: 18, height: 18 }),
        e('input', {
          ref: inputRef, value: q, onChange: (ev) => setQ(ev.target.value), onKeyDown: onKey,
          placeholder: 'Buscar propiedad, ID, persona, teléfono o huésped…', 'aria-label': 'Buscar',
        }),
        loading && e('span', { className: 'gs-spin', 'aria-hidden': true }),
        e('kbd', null, 'Esc'),
      ),
      e('div', { className: 'gs-list', ref: listRef },
        items.length === 0
          ? e('div', { className: 'gs-empty' }, loading ? 'Buscando…' : 'Sin resultados. Probá con el ID, la calle, el nombre o el teléfono.')
          : items.map((it, i) => {
              const head = it.group !== lastGroup ? e('div', { key: `h-${it.group}`, className: 'gs-group' }, it.group) : null;
              lastGroup = it.group;
              return [head, e('button', {
                key: it.key, type: 'button', className: `gs-item${i === active ? ' active' : ''}`,
                onMouseEnter: () => setActive(i), onClick: () => choose(it),
              },
                it.img
                  ? e('img', { className: 'gs-thumb', src: it.img, alt: '', loading: 'lazy' })
                  : e('span', { className: 'gs-icon' }, e(it.icon || Icons.Search, { width: 15, height: 15 })),
                e('span', { className: 'gs-text' },
                  e('span', { className: 'gs-title' }, it.title),
                  it.sub && e('span', { className: 'gs-sub' }, it.sub),
                ),
                i === active && e('span', { className: 'gs-enter' }, '↵'),
              )];
            }),
      ),
    ),
  );
}
