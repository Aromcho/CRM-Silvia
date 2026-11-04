'use client';
// Consultas como bandeja (C2): una fila por persona con todas sus consultas. Tocar WhatsApp,
// Llamar o Email deja registro de quién y cuándo y pasa la consulta a «En conversación».
// Vistas Mías / Sin asignar / Todas, etapas con contador y paso masivo de las viejas a «Históricas».
import React from 'react';
import Icons from '../Icons/Icons';
import FiltersButton from '../UI/FiltersButton';
import { NewLeadModal, LeadEmailToggle } from './Leads';
import {
  getLeadInbox, getLeadPerson, contactLeadPerson, addLeadPersonNote, updateLeadPerson,
  previewArchiveOldLeads, archiveOldLeads, getAgents,
} from '@/services/api';
import './Leads.css';
import './Consultas.css';

const e = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

const LIMIT = 30;
const VIEWS = [
  { key: 'mine', label: 'Mías' },
  { key: 'unassigned', label: 'Sin asignar' },
  { key: 'all', label: 'Todas' },
];
const STAGES = [
  { key: 'nuevas', label: 'Nuevas', status: 'nuevo' },
  { key: 'conversacion', label: 'En conversación', status: 'en_progreso' },
  { key: 'reserva', label: 'Visita o reserva', status: 'reservado' },
  { key: 'cerradas', label: 'Cerradas', status: 'cerrado' },
  { key: 'historicas', label: 'Históricas', status: 'historico' },
];
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));
const SOURCE_LABELS = { manual: 'Carga manual', mercadolibre: 'MercadoLibre', zonaprop: 'ZonaProp', web: 'Web', whatsapp: 'WhatsApp', otro: 'Otro' };
const CHANNEL_TEXT = { whatsapp: 'escribió por WhatsApp', llamada: 'llamó', email: 'mandó un email', portal: 'respondió en el portal' };
const AVATAR_PALETTE = ['#15784f', '#2563eb', '#b8791b', '#7257c9', '#0e8a8a', '#d8504a'];

function colorOf(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `${hs} h`;
  const days = Math.floor(hs / 24);
  if (days < 30) return `${days} d`;
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' });
}
function fullDate(dateStr) {
  return new Date(dateStr).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function andMore(list, more) {
  if (!list.length) return '';
  if (list.length === 1 && !more) return list[0];
  const extra = more + Math.max(0, list.length - 1);
  return `${list[0]}${extra ? ` y ${extra} más` : ''}`;
}
function waHref(phone, name, title) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) digits = `549${digits}`; // celular argentino cargado sin país
  const ref = title ? ` sobre "${title}"` : '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(`¡Hola ${name || ''}! Te escribo de Silvia Fernández Inmobiliaria por tu consulta${ref}.`)}`;
}

function PersonRow({ p, active, onOpen }) {
  const multi = p.count > 1;
  return e('button', {
    type: 'button', className: `cq-row${active ? ' active' : ''}`, onClick: () => onOpen(p.key), 'aria-current': active ? 'true' : undefined,
  },
    e('span', { className: 'cq-avatar', style: { background: colorOf(p.key) }, 'aria-hidden': true }, initials(p.name)),
    e('span', { className: 'cq-row-main' },
      e('span', { className: 'cq-row-top' },
        e('span', { className: 'cq-row-name' }, p.name),
        e('span', { className: 'cq-row-time' }, timeAgo(p.lastAt)),
      ),
      e('span', { className: 'cq-row-title' }, andMore(p.titles, p.moreTitles) || p.lastMessage || 'Consulta general'),
      e('span', { className: 'cq-row-meta' },
        p.sources.slice(0, 2).map((s) => e('span', { key: s, className: `cq-src ${s}` }, SOURCE_LABELS[s] || s)),
        multi ? e('span', { className: 'cq-multi' }, `${p.count} consultas`) : null,
        p.assignedTo?.name
          ? e('span', { className: 'cq-assignee' }, e(Icons.User, { width: 11, height: 11 }), p.assignedTo.name.split(' ')[0])
          : e('span', { className: 'cq-assignee none' }, 'Sin asignar'),
        p.lastContactAt ? e('span', { className: 'cq-contacted', title: `Último contacto: ${fullDate(p.lastContactAt)}` }, e(Icons.Check, { width: 11, height: 11 }), timeAgo(p.lastContactAt)) : null,
      ),
    ),
  );
}

function Timeline({ items }) {
  if (!items?.length) return null;
  return e('ol', { className: 'cq-timeline' },
    items.map((t, i) => {
      let icon = Icons.Mail;
      let text;
      if (t.kind === 'lead') {
        icon = Icons.Mail;
        text = e(React.Fragment, null,
          'Entró por ', e('strong', null, SOURCE_LABELS[t.source] || t.source || 'otro canal'),
          t.propertyTitle ? e(React.Fragment, null, ': ', t.propertyId ? e('a', { href: `/propiedades/${t.propertyId}` }, t.propertyTitle) : t.propertyTitle) : null,
          t.message ? e('span', { className: 'cq-tl-msg' }, `«${t.message}»`) : null,
        );
      } else if (t.kind === 'contact') {
        icon = t.channel === 'llamada' ? Icons.Phone : t.channel === 'email' ? Icons.Mail : Icons.WhatsApp;
        text = e(React.Fragment, null, e('strong', null, t.user || 'Alguien'), ' ', CHANNEL_TEXT[t.channel] || 'contactó');
      } else if (t.kind === 'note') {
        icon = Icons.Edit;
        text = e(React.Fragment, null, e('strong', null, t.user || 'Nota'), ' anotó: ', e('span', { className: 'cq-tl-msg' }, t.text));
      } else {
        icon = t.kind === 'assigned' ? Icons.User : Icons.Tag;
        text = t.text;
      }
      return e('li', { key: i, className: `cq-tl-item ${t.kind}` },
        e('span', { className: 'cq-tl-icon', 'aria-hidden': true }, e(icon, { width: 13, height: 13 })),
        e('div', { className: 'cq-tl-body' }, e('div', { className: 'cq-tl-text' }, text), e('div', { className: 'cq-tl-time' }, fullDate(t.at))),
      );
    }),
  );
}

function PersonPanel({ personKey, agents, onBack, onChanged }) {
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getLeadPerson(personKey)
      .then((p) => setPerson(p))
      .catch(() => setPerson(null))
      .finally(() => setLoading(false));
  }, [personKey]);

  useEffect(() => { setPerson(null); setNote(''); setMsg(''); load(); }, [load]);

  if (loading && !person) return e('div', { className: 'cq-panel' }, e('div', { className: 'cq-panel-loading' }, 'Cargando…'));
  if (!person) return e('div', { className: 'cq-panel' }, e('div', { className: 'cq-panel-loading' }, 'No se pudo abrir esta consulta.'));

  const latestTitle = person.leads.find((l) => l.propertyTitle)?.propertyTitle || '';
  const wa = waHref(person.phone, person.name.split(' ')[0], latestTitle);
  const tel = person.phone ? `tel:${String(person.phone).replace(/[^\d+]/g, '')}` : null;
  const mail = person.email ? `mailto:${person.email}?subject=${encodeURIComponent(`Tu consulta${latestTitle ? ` por ${latestTitle}` : ''} — Silvia Fernández Inmobiliaria`)}` : null;
  const sources = [...new Set(person.leads.map((l) => SOURCE_LABELS[l.source] || l.source).filter(Boolean))];
  const firstAt = person.leads[person.leads.length - 1]?.createdAt;
  const spanDays = firstAt ? Math.max(1, Math.round((Date.now() - new Date(firstAt).getTime()) / 86400000)) : 1;
  const currentStatus = person.leads[0]?.status;

  // Registrar el contacto sin frenar el link (WhatsApp / teléfono / mail se abren igual)
  const registerContact = (channel) => {
    contactLeadPerson(person.key, channel)
      .then((r) => {
        setMsg(r?.opened ? 'Listo: pasó a «En conversación».' : 'Contacto registrado.');
        load();
        onChanged();
      })
      .catch(() => setMsg('No se pudo registrar el contacto.'));
  };

  const patch = async (data, okText) => {
    setBusy(true);
    try {
      await updateLeadPerson(person.key, data);
      setMsg(okText);
      load();
      onChanged();
    } catch (err) {
      setMsg(err.message || 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await addLeadPersonNote(person.key, note.trim());
      setNote('');
      load();
    } catch (err) {
      setMsg(err.message || 'No se pudo guardar la nota.');
    } finally {
      setBusy(false);
    }
  };

  return e('div', { className: 'cq-panel' },
    e('div', { className: 'cq-panel-head' },
      e('button', { type: 'button', className: 'cq-back', onClick: onBack, 'aria-label': 'Volver a la lista' }, e(Icons.ChevronLeft, { width: 18, height: 18 })),
      e('span', { className: 'cq-avatar lg', style: { background: colorOf(person.key) }, 'aria-hidden': true }, initials(person.name)),
      e('div', { className: 'cq-panel-id' },
        e('h2', null, person.name),
        e('p', null, `${person.leads.length === 1 ? '1 consulta' : `${person.leads.length} consultas`} por ${sources.join(' y ')}${person.leads.length > 1 ? ` en ${spanDays === 1 ? '1 día' : `${spanDays} días`}` : ''}`),
      ),
      person.emailOptOut ? e('span', { className: 'status-badge badge-optout', title: 'Se dio de baja del Mail Marketing' }, 'Sin mails masivos') : null,
    ),

    e('div', { className: 'cq-actions' },
      e('a', { className: `lead-cbtn wa${wa ? '' : ' off'}`, href: wa || undefined, target: '_blank', rel: 'noreferrer', onClick: () => wa && registerContact('whatsapp') },
        e(Icons.WhatsApp, { width: 15, height: 15 }), 'WhatsApp'),
      e('a', { className: `lead-cbtn call${tel ? '' : ' off'}`, href: tel || undefined, onClick: () => tel && registerContact('llamada') },
        e(Icons.Phone, { width: 14, height: 14 }), 'Llamar'),
      e('a', { className: `lead-cbtn mail${mail ? '' : ' off'}`, href: mail || undefined, onClick: () => mail && registerContact('email') },
        e(Icons.Mail, { width: 14, height: 14 }), 'Email'),
    ),
    e('p', { className: 'cq-hint' }, msg || 'Al tocar cualquiera queda registrado quién y cuándo, y pasa a «En conversación».'),

    e('div', { className: 'cq-section' },
      e('div', { className: 'cq-field' },
        e('label', { htmlFor: 'cq-assign' }, 'Asesor'),
        e('select', {
          id: 'cq-assign', value: person.assignedTo?._id || '', disabled: busy,
          onChange: (ev) => patch({ assignedTo: ev.target.value || null }, ev.target.value ? 'Asignada.' : 'Quedó sin asignar.'),
        },
          e('option', { value: '' }, 'Sin asignar'),
          agents.map((u) => e('option', { key: u._id, value: u._id }, u.name)),
        ),
      ),
      e('div', { className: 'cq-field' },
        e('span', { className: 'cq-label' }, 'Etapa'),
        e('div', { className: 'cq-stage-btns', role: 'group', 'aria-label': 'Cambiar etapa' },
          STAGES.map((s) => e('button', {
            key: s.key, type: 'button', disabled: busy,
            className: `btn xs${person.stage === s.key ? ' primary' : ' ghost'}`,
            'aria-pressed': person.stage === s.key,
            onClick: () => person.stage !== s.key && patch({ status: s.status }, `Pasó a «${s.label}».`),
          }, s.label)),
          currentStatus !== 'descartado'
            ? e('button', { type: 'button', disabled: busy, className: 'btn xs ghost cq-discard', onClick: () => patch({ status: 'descartado' }, 'Descartada.') }, 'Descartar')
            : null,
        ),
      ),
    ),

    e('div', { className: 'cq-section' },
      e('h3', null, 'Consultó por'),
      e('ul', { className: 'cq-asked' },
        person.leads.map((l) => e('li', { key: l._id },
          e('div', { className: 'cq-asked-top' },
            l.propertyId
              ? e('a', { href: `/propiedades/${l.propertyId}` }, l.propertyTitle || `Propiedad #${l.propertyId}`)
              : e('span', null, l.propertyTitle || 'Consulta general'),
            e('span', { className: 'cq-asked-when' }, timeAgo(l.createdAt)),
          ),
          e('div', { className: 'cq-asked-meta' },
            e('span', { className: `cq-src ${l.source}` }, SOURCE_LABELS[l.source] || l.source),
            l.phone ? e('span', null, l.phone) : null,
            l.email ? e('span', null, l.email) : null,
          ),
          l.message ? e('p', { className: 'cq-asked-msg' }, l.message) : null,
        )),
      ),
    ),

    e('div', { className: 'cq-section' },
      e('h3', null, 'Historial'),
      e('div', { className: 'cq-note' },
        e('textarea', {
          value: note, onChange: (ev) => setNote(ev.target.value), rows: 2, placeholder: 'Anotá lo que hablaste o lo próximo a hacer…', 'aria-label': 'Nueva nota',
        }),
        e('button', { type: 'button', className: 'btn primary sm', disabled: busy || !note.trim(), onClick: saveNote }, 'Anotar'),
      ),
      e(Timeline, { items: person.timeline }),
    ),
  );
}

export default function Consultas({ session }) {
  const isAdmin = session?.role === 'ADMIN' || session?.role === 'SUPERADMIN';
  const [view, setView] = useState('all');
  const [stage, setStage] = useState('nuevas');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [source, setSource] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [agents, setAgents] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [oldCount, setOldCount] = useState(0);
  const [archiving, setArchiving] = useState(false);
  const reqId = useRef(0);

  useEffect(() => { getAgents().then((a) => setAgents(a || [])).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (!isAdmin) return;
    previewArchiveOldLeads(30).then((r) => setOldCount(r?.count || 0)).catch(() => {});
  }, [isAdmin]);

  const load = useCallback((off = 0) => {
    const id = ++reqId.current;
    setLoading(true);
    const params = { view, stage, limit: LIMIT, offset: off };
    if (debouncedQ) params.q = debouncedQ;
    if (source !== 'all') params.source = source;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    getLeadInbox(params)
      .then((res) => {
        if (id !== reqId.current || !res) return;
        setRows(off ? (prev) => [...prev, ...(res.objects || [])] : (res.objects || []));
        setCounts(res.counts || {});
        setTotal(res.meta?.total || 0);
        setOffset(off);
      })
      .catch(() => {})
      .finally(() => { if (id === reqId.current) setLoading(false); });
  }, [view, stage, debouncedQ, source, dateFrom, dateTo]);

  useEffect(() => { load(0); }, [load]);

  const archiveOld = async () => {
    if (!window.confirm(`Pasar ${oldCount.toLocaleString('es-AR')} consultas de hace más de 30 días, sin ningún contacto, a «Históricas»? No se borran y se pueden reabrir.`)) return;
    setArchiving(true);
    try {
      await archiveOldLeads(30);
      setOldCount(0);
      load(0);
    } finally {
      setArchiving(false);
    }
  };

  const activeFilters = (source !== 'all') + Boolean(dateFrom || dateTo);

  return e('div', { className: `cq${selected ? ' has-selection' : ''}` },
    e('div', { className: 'leads-toolbar cq-toolbar' },
      e('div', { className: 'leads-toolbar-left' },
        e('h1', null, 'Consultas'),
        e('div', { className: 'cq-views', role: 'tablist', 'aria-label': 'Vista' },
          VIEWS.map((v) => e('button', {
            key: v.key, type: 'button', role: 'tab', 'aria-selected': view === v.key,
            className: view === v.key ? 'on' : '', onClick: () => { setView(v.key); setSelected(null); },
          }, v.label)),
        ),
      ),
      e('div', { className: 'leads-toolbar-right' },
        e(LeadEmailToggle),
        e('div', { className: 'search toolbar-search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', { placeholder: 'Nombre, email, teléfono o ID', value: q, onChange: (ev) => setQ(ev.target.value), 'aria-label': 'Buscar consultas' }),
          q ? e('button', { className: 'search-clear', onClick: () => setQ(''), 'aria-label': 'Limpiar búsqueda' }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
        e(FiltersButton, { open: filtersOpen, onToggle: () => setFiltersOpen((v) => !v), count: activeFilters }),
        e('button', { className: 'btn primary sm', onClick: () => setShowNew(true) }, e(Icons.Plus, { width: 14, height: 14 }), 'Nueva'),
      ),
    ),

    e('div', { className: `lead-filters-bar filters-collapsible${filtersOpen ? ' open' : ''}` },
      e('div', { className: 'lead-filter-group' },
        e('label', null, 'Fuente'),
        e('select', { value: source, onChange: (ev) => setSource(ev.target.value) },
          e('option', { value: 'all' }, 'Todas'),
          Object.entries(SOURCE_LABELS).map(([k, v]) => e('option', { key: k, value: k }, v)),
        ),
      ),
      e('div', { className: 'lead-filter-group lead-filter-dates' },
        e('label', null, 'Fecha'),
        e('input', { type: 'date', className: 'lead-date-input', value: dateFrom, onChange: (ev) => setDateFrom(ev.target.value), 'aria-label': 'Desde' }),
        e('span', { className: 'lead-filter-sep' }, '—'),
        e('input', { type: 'date', className: 'lead-date-input', value: dateTo, onChange: (ev) => setDateTo(ev.target.value), 'aria-label': 'Hasta' }),
      ),
      activeFilters ? e('button', { type: 'button', className: 'btn ghost xs', onClick: () => { setSource('all'); setDateFrom(''); setDateTo(''); } }, 'Limpiar filtros') : null,
    ),

    e('div', { className: 'cq-stages', role: 'tablist', 'aria-label': 'Etapa' },
      STAGES.map((s) => e('button', {
        key: s.key, type: 'button', role: 'tab', 'aria-selected': stage === s.key,
        className: `cq-stage${stage === s.key ? ' on' : ''}`, onClick: () => { setStage(s.key); setSelected(null); },
      }, s.label, e('span', { className: 'cq-stage-n' }, (counts[s.key] || 0).toLocaleString('es-AR')))),
    ),

    isAdmin && oldCount > 0 && stage === 'nuevas'
      ? e('div', { className: 'cq-banner' },
          e(Icons.Layers, { width: 16, height: 16 }),
          e('span', null, `${oldCount.toLocaleString('es-AR')} consultas de hace más de 30 días siguen en «Nuevas» sin ningún contacto.`),
          e('button', { type: 'button', className: 'btn ghost xs', disabled: archiving, onClick: archiveOld }, archiving ? 'Pasando…' : 'Pasar a Históricas'),
        )
      : null,

    e('div', { className: 'cq-body' },
      e('div', { className: 'cq-list', 'aria-busy': loading },
        rows.length === 0 && !loading
          ? e('div', { className: 'lead-empty' }, e(Icons.Mail, { width: 40, height: 40 }),
              e('p', null, view === 'mine' ? `No tenés consultas en «${STAGE_LABEL[stage]}».` : `No hay consultas en «${STAGE_LABEL[stage]}».`))
          : rows.map((p) => e(PersonRow, { key: p.key, p, active: selected === p.key, onOpen: setSelected })),
        loading ? e('div', { className: 'loading-state' }, 'Cargando…') : null,
        !loading && rows.length < total
          ? e('button', { type: 'button', className: 'btn ghost sm cq-more', onClick: () => load(offset + LIMIT) }, `Ver más (${(total - rows.length).toLocaleString('es-AR')})`)
          : null,
      ),
      e('div', { className: 'cq-detail' },
        selected
          ? e(PersonPanel, { key: selected, personKey: selected, agents, onBack: () => setSelected(null), onChanged: () => load(0) })
          : e('div', { className: 'cq-placeholder' },
              e(Icons.MessageCircle, { width: 36, height: 36 }),
              e('p', null, 'Elegí una persona para ver todas sus consultas, contactarla y anotar el seguimiento.'),
            ),
      ),
    ),

    showNew ? e(NewLeadModal, { onClose: () => setShowNew(false), onCreated: () => load(0) }) : null,
  );
}
