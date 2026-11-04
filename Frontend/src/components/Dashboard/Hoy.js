'use client';
// «Hoy» (C1): el inicio dice qué resolver. Consultas sin responder agrupadas por persona, avisos
// que no se publicaron, destacados en uso, movimiento de temporada y la actividad del equipo
// agrupada y en castellano. La cartera por estado queda en una franja chica al final.
import React from 'react';
import Icons from '../Icons/Icons';
import { getToday } from '@/services/api';
import { photoSrc } from '@/lib/data';
import './Hoy.css';

const e = React.createElement;
const { useState, useEffect, useMemo, useCallback } = React;

const PLATFORM = { mercadolibre: 'MercadoLibre', zonaprop: 'ZonaProp' };
const SOURCE = { mercadolibre: 'MercadoLibre', zonaprop: 'ZonaProp', web: 'la web', whatsapp: 'WhatsApp', manual: 'carga manual', otro: 'otro canal' };
const FEED_FILTERS = [
  { key: 'all', label: 'Todo' },
  { key: 'price', label: 'Precios' },
  { key: 'status', label: 'Estados' },
  { key: 'photos', label: 'Fotos' },
  { key: 'lead', label: 'Consultas' },
];

function greeting(date) {
  const h = date.getHours();
  if (h < 13) return 'Buen día';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function longDate(date) {
  const s = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs} h`;
  const days = Math.floor(hs / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function shortDay(dateStr) {
  const d = new Date(dateStr);
  const s = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const plural = (n, one, many) => `${n.toLocaleString('es-AR')} ${n === 1 ? one : many}`;

function andList(parts) {
  const list = parts.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

function Skeleton() {
  return e('div', { className: 'hoy-skeleton', 'aria-hidden': true },
    [0, 1, 2].map((i) => e('div', { key: i, className: 'hoy-skel-row' },
      e('span', { className: 'hoy-skel-dot' }),
      e('span', { className: 'hoy-skel-lines' }, e('span', null), e('span', null)),
    )),
  );
}

// Una fila de «Para resolver hoy»
function TaskRow({ tone, icon: Icon, title, sub, people, action, onAction, children }) {
  return e('div', { className: `hoy-task tone-${tone}` },
    e('span', { className: 'hoy-task-icon', 'aria-hidden': true }, e(Icon, { width: 18, height: 18 })),
    e('div', { className: 'hoy-task-body' },
      e('div', { className: 'hoy-task-title' }, title),
      sub ? e('div', { className: 'hoy-task-sub' }, sub) : null,
      people && people.length ? e('div', { className: 'hoy-avatars', 'aria-hidden': true },
        people.map((p, i) => e('span', { key: i, className: 'hoy-avatar', title: p.name }, p.initials)),
      ) : null,
      children,
    ),
    action ? e('button', { type: 'button', className: `btn sm hoy-task-btn${tone === 'gray' ? ' ghost' : ' primary'}`, onClick: onAction }, action, e(Icons.Chevron, { width: 14, height: 14 })) : null,
  );
}

function ResolveCard({ data, go }) {
  const { unanswered, difusion, highlights, season } = data;
  const rows = [];

  if (unanswered.leads > 0) {
    const latest = unanswered.latest;
    rows.push(e(TaskRow, {
      key: 'leads', tone: 'blue', icon: Icons.Mail,
      title: `${plural(unanswered.leads, 'consulta', 'consultas')} de ${plural(unanswered.people, 'persona', 'personas')} sin responder`,
      sub: latest
        ? `Últimas ${unanswered.windowHours} h. La más reciente: ${latest.name}${latest.propertyTitle ? `, ${latest.propertyTitle}` : ''}, ${timeAgo(latest.createdAt)}${SOURCE[latest.source] ? ` por ${SOURCE[latest.source]}` : ''}.`
        : null,
      people: unanswered.sample,
      action: 'Responder', onAction: () => go('leads'),
    }));
  }

  if (difusion.errors > 0) {
    const where = andList([
      difusion.byPlatform.mercadolibre ? `${difusion.byPlatform.mercadolibre} en MercadoLibre` : '',
      difusion.byPlatform.zonaprop ? `${difusion.byPlatform.zonaprop} en ZonaProp` : '',
    ]);
    rows.push(e(TaskRow, {
      key: 'difusion', tone: 'red', icon: Icons.AlertTriangle,
      title: `${plural(difusion.errors, 'aviso no se publicó', 'avisos no se publicaron')}`,
      sub: `${where}. Abajo está el motivo de cada uno.`,
      action: 'Ver difusión', onAction: () => go('difusion'),
    },
      e('ul', { className: 'hoy-errors' },
        difusion.items.slice(0, 3).map((it, i) => e('li', { key: `${it.propertyId}-${i}` },
          e('a', { href: `/propiedades/${it.propertyId}`, className: 'hoy-error-link' },
            e('span', { className: `hoy-chip ${it.platform}` }, PLATFORM[it.platform] || it.platform),
            e('span', { className: 'hoy-error-addr' }, it.address),
          ),
          e('span', { className: 'hoy-error-msg' }, it.message),
        )),
      ),
    ));
  }

  if (season.weekIn > 0 || season.weekOut > 0) {
    rows.push(e(TaskRow, {
      key: 'season', tone: 'amber', icon: Icons.Calendar,
      title: `Esta semana: ${andList([season.weekIn ? plural(season.weekIn, 'entrada', 'entradas') : '', season.weekOut ? plural(season.weekOut, 'salida', 'salidas') : ''])}`,
      sub: season.nextIn ? `Próxima entrada: ${shortDay(season.nextIn.date)}${season.nextIn.guestName ? `, ${season.nextIn.guestName}` : ''} — ${season.nextIn.address}.` : null,
      action: 'Ver reservas', onAction: () => go('alquileres'),
    }));
  }

  const hl = (highlights.mercadolibre || 0) + (highlights.zonaprop || 0);
  if (hl > 0) {
    rows.push(e(TaskRow, {
      key: 'highlights', tone: 'green', icon: Icons.Star,
      title: `${plural(hl, 'aviso destacado', 'avisos destacados')} en uso`,
      sub: `${andList([highlights.mercadolibre ? `${highlights.mercadolibre} Oro Premium en MercadoLibre` : '', highlights.zonaprop ? `${highlights.zonaprop} destacados en ZonaProp` : ''])}. Revisá que sigan siendo las que más conviene destacar.`,
      action: 'Revisar', onAction: () => go('difusion'),
    }));
  }

  if (unanswered.olderNew > 0) {
    rows.push(e(TaskRow, {
      key: 'old', tone: 'gray', icon: Icons.Layers,
      title: `${plural(unanswered.olderNew, 'consulta vieja sigue', 'consultas viejas siguen')} en «Nuevo»`,
      sub: 'Llegaron hace más de 2 días y nadie les cambió el estado. Desde Consultas se pueden pasar a «Históricas» sin borrarlas.',
      action: 'Ordenar', onAction: () => go('leads'),
    }));
  }

  return e('section', { className: 'hoy-card', 'aria-labelledby': 'hoy-resolve-title' },
    e('div', { className: 'hoy-card-head' },
      e('h2', { id: 'hoy-resolve-title' }, 'Para resolver hoy'),
      e('span', { className: 'hoy-count' }, rows.length ? plural(rows.length, 'tema', 'temas') : 'Al día'),
    ),
    rows.length
      ? e('div', { className: 'hoy-tasks' }, rows)
      : e('div', { className: 'hoy-empty' },
          e('span', { className: 'hoy-empty-icon' }, e(Icons.Check, { width: 18, height: 18 })),
          'Nada pendiente: no hay consultas sin responder ni avisos con error.',
        ),
  );
}

function ActivityCard({ items }) {
  const [filter, setFilter] = useState('all');
  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((a) => (a.kinds || []).includes(filter))),
    [items, filter],
  );

  return e('section', { className: 'hoy-card', 'aria-labelledby': 'hoy-feed-title' },
    e('div', { className: 'hoy-card-head' },
      e('h2', { id: 'hoy-feed-title' }, 'Actividad del equipo'),
      e('div', { className: 'hoy-seg', role: 'tablist', 'aria-label': 'Filtrar actividad' },
        FEED_FILTERS.map((f) => e('button', {
          key: f.key, type: 'button', role: 'tab', 'aria-selected': filter === f.key,
          className: filter === f.key ? 'on' : '', onClick: () => setFilter(f.key),
        }, f.label)),
      ),
    ),
    visible.length === 0
      ? e('div', { className: 'hoy-empty muted' }, 'No hay movimientos de este tipo en los últimos días.')
      : e('ol', { className: 'hoy-feed' },
          visible.map((a) => {
            const thumb = a.image ? photoSrc({ local_image: a.image }) : null;
            const body = e(React.Fragment, null,
              thumb
                ? e('img', { src: thumb, alt: '', className: 'hoy-feed-thumb', loading: 'lazy' })
                : e('span', { className: 'hoy-feed-avatar', 'aria-hidden': true }, a.userInitials),
              e('div', { className: 'hoy-feed-body' },
                e('p', { className: 'hoy-feed-text' },
                  e('strong', null, a.user), ' ', a.text,
                  a.entityType === 'property' ? e(React.Fragment, null, ' en ', e('strong', null, a.address)) : null,
                ),
                a.details?.length ? e('ul', { className: 'hoy-feed-details' }, a.details.map((d, i) => e('li', { key: i }, d))) : null,
                e('span', { className: 'hoy-feed-time' },
                  timeAgo(a.at),
                  a.entityType === 'property' ? ` · #${a.propertyId}` : '',
                  a.count > 1 ? ` · ${a.count} cambios` : '',
                ),
              ),
            );
            return e('li', { key: a.id },
              a.entityType === 'property'
                ? e('a', { href: `/propiedades/${a.propertyId}`, className: 'hoy-feed-item link' }, body)
                : e('div', { className: 'hoy-feed-item' }, body),
            );
          }),
        ),
  );
}

function SeasonCard({ season, go }) {
  const max = Math.max(1, ...season.byMonth.map((m) => m.count));
  return e('section', { className: 'hoy-card hoy-season', 'aria-labelledby': 'hoy-season-title' },
    e('div', { className: 'hoy-card-head' },
      e('h2', { id: 'hoy-season-title' }, `Temporada ${season.label}`),
      e('button', { type: 'button', className: 'hoy-link', onClick: () => go('alquileres') }, 'Ver todo'),
    ),
    e('div', { className: 'hoy-season-total' },
      e('span', { className: 'num' }, season.total.toLocaleString('es-AR')),
      e('span', { className: 'lbl' }, season.total === 1 ? 'reserva cargada' : 'reservas cargadas'),
    ),
    e('div', { className: 'hoy-bars', role: 'img', 'aria-label': season.byMonth.map((m) => `${m.label}: ${m.count}`).join(', ') },
      season.byMonth.map((m) => e('div', { key: m.key, className: 'hoy-bar' },
        e('span', { className: 'hoy-bar-num' }, m.count),
        e('span', { className: 'hoy-bar-track' }, e('span', { className: 'hoy-bar-fill', style: { height: `${Math.max(6, (m.count / max) * 100)}%` } })),
        e('span', { className: 'hoy-bar-lbl' }, m.label),
      )),
    ),
    e('div', { className: 'hoy-next' },
      e('div', { className: 'hoy-next-item' },
        e('span', { className: 'k' }, 'Próxima entrada'),
        season.nextIn
          ? e(React.Fragment, null,
              e('span', { className: 'v' }, `${shortDay(season.nextIn.date)}${season.nextIn.guestName ? `, ${season.nextIn.guestName}` : ''}`),
              e('a', { className: 's', href: `/propiedades/${season.nextIn.propertyId}` }, season.nextIn.address),
            )
          : e('span', { className: 'v muted' }, 'Sin entradas cargadas'),
      ),
      e('div', { className: 'hoy-next-item' },
        e('span', { className: 'k' }, 'Próxima salida'),
        season.nextOut
          ? e(React.Fragment, null,
              e('span', { className: 'v' }, `${shortDay(season.nextOut.date)}${season.nextOut.guestName ? `, ${season.nextOut.guestName}` : ''}`),
              e('a', { className: 's', href: `/propiedades/${season.nextOut.propertyId}` }, season.nextOut.address),
            )
          : e('span', { className: 'v muted' }, 'Sin salidas próximas'),
      ),
    ),
  );
}

function PortfolioStrip({ portfolio, go }) {
  const items = [
    { key: 'disponible', label: 'Disponibles', cls: 'ok' },
    { key: 'reservada', label: 'Reservadas', cls: 'warn' },
    { key: 'vendida', label: 'Vendidas', cls: 'bad' },
    { key: 'otras', label: 'Otras', cls: 'muted' },
  ];
  return e('section', { className: 'hoy-card hoy-portfolio', 'aria-labelledby': 'hoy-portfolio-title' },
    e('div', { className: 'hoy-card-head' },
      e('h2', { id: 'hoy-portfolio-title' }, 'Cartera'),
      e('button', { type: 'button', className: 'hoy-link', onClick: () => go('propiedades') }, `${portfolio.total} propiedades`),
    ),
    e('div', { className: 'hoy-portfolio-row' },
      items.map((it) => e('div', { key: it.key, className: `hoy-pf ${it.cls}` },
        e('span', { className: 'num' }, (portfolio[it.key] || 0).toLocaleString('es-AR')),
        e('span', { className: 'lbl' }, it.label),
      )),
    ),
  );
}

export default function Hoy({ session, setTab }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const now = useMemo(() => new Date(), []);

  const load = useCallback(() => {
    setError('');
    getToday()
      .then((res) => { if (res) setData(res); })
      .catch((err) => setError(err.message || 'No se pudo cargar el inicio.'));
  }, []);

  useEffect(() => {
    load();
    // Se refresca solo cada 2 minutos mientras la pestaña está abierta
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  const go = (key) => { if (setTab) setTab(key); };
  const firstName = session?.name?.split(' ')[0] || '';

  return e('div', { className: 'hoy' },
    e('header', { className: 'hoy-header' },
      e('div', null,
        e('h1', null, `${greeting(now)}${firstName ? `, ${firstName}` : ''}`),
        e('p', null, longDate(now)),
      ),
      e('div', { className: 'hoy-quick' },
        e('button', { type: 'button', className: 'btn ghost sm', onClick: () => go('leads') }, e(Icons.Mail, { width: 14, height: 14 }), 'Consultas'),
        e('button', { type: 'button', className: 'btn primary sm', onClick: () => go('propiedades') }, e(Icons.Building, { width: 14, height: 14 }), 'Propiedades'),
      ),
    ),

    error
      ? e('div', { className: 'hoy-card hoy-error-box', role: 'alert' },
          e('span', null, error),
          e('button', { type: 'button', className: 'btn primary sm', onClick: load }, 'Reintentar'),
        )
      : null,

    !data && !error
      ? e('div', { className: 'hoy-grid' },
          e('div', { className: 'hoy-col' }, e('section', { className: 'hoy-card' }, e(Skeleton))),
          e('div', { className: 'hoy-col side' }, e('section', { className: 'hoy-card' }, e(Skeleton))),
        )
      : null,

    data
      ? e('div', { className: 'hoy-grid' },
          e('div', { className: 'hoy-col' },
            e(ResolveCard, { data, go }),
            e('div', { className: 'hoy-only-mobile' }, e(SeasonCard, { season: data.season, go })),
            e(ActivityCard, { items: data.activity || [] }),
          ),
          e('div', { className: 'hoy-col side' },
            e('div', { className: 'hoy-only-desktop' }, e(SeasonCard, { season: data.season, go })),
            e(PortfolioStrip, { portfolio: data.portfolio, go }),
          ),
        )
      : null,
  );
}
