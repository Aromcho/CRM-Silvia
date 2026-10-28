'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import MailEditor from './MailEditor';
import {
  getMailConfig, updateMailConfig, getMailFilterOptions, previewMailAudience,
  getMailCampaigns, getMailCampaign, createMailCampaign, updateMailCampaign, deleteMailCampaign, duplicateMailCampaign,
  previewMailCampaign, sendMailTest, startMailCampaign, pauseMailCampaign, resumeMailCampaign, cancelMailCampaign, getMailCampaignSends,
} from '@/services/api';
import './MailMarketing.css';

const e = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

const STATUS_LABELS = { draft: 'Borrador', sending: 'Enviando', paused: 'Pausada', finished: 'Finalizada', cancelled: 'Cancelada' };
const SEND_STATUS_LABELS = { pending: 'Pendiente', sending: 'Enviando', sent: 'Enviado', failed: 'Fallido', skipped: 'Omitido' };
const LEAD_STATUS_LABELS = { nuevo: 'Nuevo', en_progreso: 'En progreso', contactado: 'Contactado', reservado: 'Reservado', cerrado: 'Cerrado', descartado: 'Descartado' };
const SOURCE_LABELS = { manual: 'Manual', mercadolibre: 'MercadoLibre', zonaprop: 'ZonaProp', web: 'Web', whatsapp: 'WhatsApp', otro: 'Otro' };

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const EMPTY_FILTERS = { statuses: [], sources: [], dateFrom: '', dateTo: '', propertyIds: [], zones: [] };

function StatusPill({ status, waiting }) {
  return e('span', { className: `mm-pill mm-pill-${status}` }, waiting && status === 'sending' ? 'Esperando cupo' : STATUS_LABELS[status] || status);
}

function Progress({ stats }) {
  const total = stats?.total || 0;
  const done = (stats?.sent || 0) + (stats?.failed || 0) + (stats?.skipped || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  return e('div', { className: 'mm-progress', title: `${done} de ${total} procesados` }, e('span', { style: { width: `${pct}%` } }));
}

function Chips({ options, selected, onToggle, labels, disabled }) {
  if (!options?.length) return e('span', { className: 'mm-muted mm-small' }, 'Sin datos');
  return e('div', { className: 'suggestion-chips' }, options.map((o) => e('button', {
    key: o.key, type: 'button', disabled,
    className: `suggestion-chip${selected.includes(o.key) ? ' active' : ''}`,
    onClick: () => onToggle(o.key),
  }, `${labels?.[o.key] || o.key} · ${o.count}`)));
}

// ── Destinatarios ────────────────────────────────────────────────────────────────────────────────
function AudienceCard({ filters, setFilters, includeEmails, setIncludeEmails, options, audience, loading, readOnly, frozenTotal }) {
  const [propQuery, setPropQuery] = useState('');
  const toggle = (key) => (value) => setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const selectedProps = (options?.properties || []).filter((p) => filters.propertyIds.includes(p.id));
  const propMatches = propQuery.trim()
    ? (options?.properties || []).filter((p) => !filters.propertyIds.includes(p.id) && `${p.id} ${p.title} ${p.zone}`.toLowerCase().includes(propQuery.toLowerCase())).slice(0, 8)
    : [];
  const ex = audience?.excluded;

  return e('section', { className: 'mm-card' },
    e('div', { className: 'mm-card-head' },
      e('h2', null, 'Destinatarios'),
      readOnly
        ? e('span', { className: 'mm-count' }, e('strong', null, frozenTotal ?? 0), ' destinatarios (fijados al enviar)')
        : e('span', { className: 'mm-count' }, loading ? 'Contando…' : e(React.Fragment, null, e('strong', null, audience?.count ?? '—'), ' destinatarios')),
    ),
    readOnly && e('p', { className: 'mm-muted' }, 'La lista de destinatarios quedó fijada al enviar: los filtros ya no se pueden cambiar.'),
    e('div', { className: 'mm-filter-grid' },
      e('div', { className: 'field' }, e('label', null, 'Estado del lead'),
        e(Chips, { options: options?.statuses, selected: filters.statuses, onToggle: toggle('statuses'), labels: LEAD_STATUS_LABELS, disabled: readOnly })),
      e('div', { className: 'field' }, e('label', null, 'Origen'),
        e(Chips, { options: options?.sources, selected: filters.sources, onToggle: toggle('sources'), labels: SOURCE_LABELS, disabled: readOnly })),
      e('div', { className: 'field' }, e('label', null, 'Zona de la propiedad consultada'),
        e(Chips, { options: options?.zones, selected: filters.zones, onToggle: toggle('zones'), disabled: readOnly })),
      e('div', { className: 'field' }, e('label', null, 'Fecha de la consulta'),
        e('div', { className: 'mm-dates' },
          e('input', { type: 'date', value: filters.dateFrom, disabled: readOnly, onChange: (ev) => setFilters((f) => ({ ...f, dateFrom: ev.target.value })) }),
          e('span', null, 'a'),
          e('input', { type: 'date', value: filters.dateTo, disabled: readOnly, onChange: (ev) => setFilters((f) => ({ ...f, dateTo: ev.target.value })) }),
        )),
      e('div', { className: 'field mm-span2' }, e('label', null, 'Propiedad consultada'),
        selectedProps.length > 0 && e('div', { className: 'suggestion-chips' }, selectedProps.map((p) => e('button', {
          key: p.id, type: 'button', className: 'suggestion-chip active', disabled: readOnly,
          onClick: () => toggle('propertyIds')(p.id), title: 'Quitar',
        }, `#${p.id} ${p.title.slice(0, 40)} ✕`))),
        !readOnly && e('div', { className: 'mm-prop-search' },
          e('input', { value: propQuery, onChange: (ev) => setPropQuery(ev.target.value), placeholder: 'Buscar entre las propiedades con consultas…' }),
          propMatches.length > 0 && e('div', { className: 'mm-prop-results' }, propMatches.map((p) => e('button', {
            key: p.id, type: 'button', onClick: () => { toggle('propertyIds')(p.id); setPropQuery(''); },
          }, e('strong', null, `#${p.id}`), ` ${p.title}`, e('span', { className: 'mm-muted' }, ` · ${p.zone || 'sin zona'} · ${p.leads} leads`)))),
        )),
    ),
    !readOnly && (filters.statuses.length || filters.sources.length || filters.zones.length || filters.propertyIds.length || filters.dateFrom || filters.dateTo)
      ? e('button', { type: 'button', className: 'btn ghost xs', onClick: () => setFilters(EMPTY_FILTERS) }, 'Quitar filtros (todos los leads con email)')
      : null,

    !readOnly && ex && e('div', { className: 'mm-audience-detail' },
      e('span', null, `${audience.leadsMatched} leads coinciden`),
      ex.duplicates > 0 && e('span', null, `${ex.duplicates} emails repetidos unificados`),
      ex.unsubscribed > 0 && e('span', null, `${ex.unsubscribed} dados de baja`),
      ex.bounced > 0 && e('span', null, `${ex.bounced} inválidos (rebotaron antes)`),
      ex.invalidCount > 0 && e('span', null, `${ex.invalidCount} con formato inválido`),
    ),
    !readOnly && ex?.suspicious?.length > 0 && e('div', { className: 'mm-suspicious' },
      e('strong', null, `Emails @gmail.com.ar (${ex.suspicious.length}) — casi seguro mal tipeados, excluidos salvo que los marques:`),
      ex.suspicious.map((s) => e('label', { key: s.email, className: 'mm-check' },
        e('input', {
          type: 'checkbox', checked: includeEmails.includes(s.email),
          onChange: () => setIncludeEmails((list) => (list.includes(s.email) ? list.filter((x) => x !== s.email) : [...list, s.email])),
        }),
        e('span', null, s.email), s.name && e('span', { className: 'mm-muted' }, ` (${s.name})`),
      )),
    ),
    !readOnly && audience?.sample?.length > 0 && e('details', { className: 'mm-sample' },
      e('summary', null, 'Ver algunos destinatarios'),
      e('ul', null, audience.sample.map((r) => e('li', { key: r.email }, e('strong', null, r.name || '(sin nombre)'), ` — ${r.email}`, r.propertyTitle && e('span', { className: 'mm-muted' }, ` · ${r.propertyTitle}`)))),
    ),
  );
}

// ── Detalle de envío (historial por destinatario) ───────────────────────────────────────────────
function SendsCard({ campaign, flash }) {
  const [status, setStatus] = useState(campaign.stats?.failed ? 'failed' : '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    const params = { page };
    if (status) params.status = status;
    getMailCampaignSends(campaign._id, params).then(setData).catch((err) => flash(err.message, true));
  }, [campaign._id, status, page, flash]);
  useEffect(() => { load(); }, [load, campaign.stats?.sent, campaign.stats?.failed]);

  return e('section', { className: 'mm-card' },
    e('div', { className: 'mm-card-head' },
      e('h2', null, 'Envíos por destinatario'),
      e('select', { value: status, onChange: (ev) => { setStatus(ev.target.value); setPage(1); } },
        e('option', { value: '' }, 'Todos'),
        Object.entries(SEND_STATUS_LABELS).map(([k, v]) => e('option', { key: k, value: k }, v))),
    ),
    !data ? e('p', { className: 'mm-muted' }, 'Cargando…')
      : !data.docs.length ? e('p', { className: 'mm-muted' }, 'Sin envíos con este estado.')
        : e('div', { className: 'mm-table-wrap' }, e('table', { className: 'mm-table' },
          e('thead', null, e('tr', null, ['Email', 'Nombre', 'Estado', 'Fecha', 'Detalle'].map((h) => e('th', { key: h }, h)))),
          e('tbody', null, data.docs.map((s) => e('tr', { key: s._id },
            e('td', null, s.email),
            e('td', null, s.name || '—'),
            e('td', null, e('span', { className: `mm-pill mm-send-${s.status}` }, SEND_STATUS_LABELS[s.status] || s.status)),
            e('td', null, fmtDateTime(s.sentAt || s.lastAttemptAt)),
            e('td', { className: 'mm-err' }, s.skipReason || (s.error ? `${s.errorCode ? `[${s.errorCode}] ` : ''}${s.error}` : '')
              + (s.status === 'pending' && s.nextAttemptAt ? ` · reintento ${fmtDateTime(s.nextAttemptAt)}` : '')),
          ))),
        )),
    data && data.totalPages > 1 && e('div', { className: 'mm-pager' },
      e('button', { type: 'button', className: 'btn ghost sm', disabled: page <= 1, onClick: () => setPage((p) => p - 1) }, 'Anterior'),
      e('span', null, `Página ${data.page} de ${data.totalPages} · ${data.total}`),
      e('button', { type: 'button', className: 'btn ghost sm', disabled: page >= data.totalPages, onClick: () => setPage((p) => p + 1) }, 'Siguiente'),
    ),
  );
}

function EventsCard({ events }) {
  if (!events?.length) return null;
  return e('section', { className: 'mm-card' },
    e('h2', null, 'Historial'),
    e('ul', { className: 'mm-events' }, [...events].reverse().map((ev, i) => e('li', { key: i, className: `mm-event-${ev.type}` },
      e('span', { className: 'mm-muted mm-small' }, fmtDateTime(ev.at)), e('span', null, ev.message)))),
  );
}

// ── Modales ──────────────────────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return e('div', { className: 'lead-modal-overlay', onClick: onClose },
    e('div', { className: `lead-modal mm-modal${wide ? ' wide' : ''}`, onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'lead-modal-head' },
        e('h2', null, title),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose, 'aria-label': 'Cerrar' }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('div', { className: 'mm-modal-body' }, children),
    ),
  );
}

function PreviewModal({ campaignId, draft, onClose }) {
  const [email, setEmail] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(640);

  const load = useCallback((forEmail) => {
    setError('');
    previewMailCampaign(campaignId, { ...draft, email: forEmail || undefined }).then(setData).catch((err) => setError(err.message));
  }, [campaignId, draft]);
  useEffect(() => { load(''); }, [load]);

  return e(Modal, { title: 'Vista previa', onClose, wide: true },
    e('div', { className: 'mm-preview-bar' },
      e('div', { className: 'search' }, e(Icons.Search, { width: 14, height: 14 }),
        e('input', { value: email, onChange: (ev) => setEmail(ev.target.value), onKeyDown: (ev) => ev.key === 'Enter' && load(email), placeholder: 'Ver como… (email de un lead)' })),
      e('button', { type: 'button', className: 'btn ghost sm', onClick: () => load(email) }, 'Ver'),
      e('div', { className: 'mm-mode' }, [[640, 'Escritorio'], [375, 'Celular']].map(([w, l]) => e('button', { key: w, type: 'button', className: width === w ? 'active' : '', onClick: () => setWidth(w) }, l))),
    ),
    error && e('p', { className: 'error-msg' }, error),
    data && e(React.Fragment, null,
      e('div', { className: 'mm-preview-meta' },
        e('div', null, e('span', null, 'Para: '), `${data.recipient.name || '(sin nombre)'} <${data.recipient.email}>`),
        e('div', null, e('span', null, 'Asunto: '), e('strong', null, data.subject)),
      ),
      e('iframe', { className: 'mm-preview-frame', title: 'Vista previa', srcDoc: data.html, sandbox: '', style: { maxWidth: width } }),
    ),
  );
}

function ConfirmSendModal({ count, settings, testedAfterEdit, onConfirm, onClose, busy }) {
  const [checked, setChecked] = useState(false);
  const days = settings ? Math.ceil(count / settings.dailyLimit) : 1;
  return e(Modal, { title: 'Confirmar envío masivo', onClose },
    e('div', { className: 'mm-confirm-count' }, e('strong', null, count), e('span', null, 'destinatarios')),
    settings && e('p', { className: 'mm-muted' },
      `Se manda 1 mail cada ${settings.minDelaySec}–${settings.maxDelaySec} segundos, con un tope de ${settings.dailyLimit} cada 24 h`,
      days > 1 ? `: va a tardar unos ${days} días. ` : '. ',
      'Sigue solo aunque cierres el CRM, y lo podés pausar o cancelar desde el historial.'),
    !testedAfterEdit && e('p', { className: 'error-msg' }, 'No mandaste una prueba desde el último cambio. Conviene revisarla antes.'),
    e('label', { className: 'mm-check' },
      e('input', { type: 'checkbox', checked, onChange: () => setChecked((v) => !v) }),
      e('span', null, `Revisé el mail y quiero enviarlo a ${count} personas.`)),
    e('div', { className: 'mm-actions' },
      e('button', { type: 'button', className: 'btn ghost', onClick: onClose }, 'Volver'),
      e('button', { type: 'button', className: 'btn primary', disabled: !checked || busy, onClick: onConfirm }, e(Icons.Send, { width: 14, height: 14 }), busy ? 'Iniciando…' : `Enviar a ${count}`),
    ),
  );
}

// ── Editor de campaña ────────────────────────────────────────────────────────────────────────────
function CampaignEditor({ id, config, onBack, flash, reloadConfig }) {
  const [campaign, setCampaign] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState(null);
  const [audience, setAudience] = useState(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [testTo, setTestTo] = useState(config?.settings?.testEmail || '');
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState('');
  const audienceTimer = useRef(null);

  const load = useCallback(async () => {
    const c = await getMailCampaign(id);
    if (!c) return;
    setCampaign(c);
    setDraft({
      name: c.name || '', subject: c.subject || '', preheader: c.preheader || '', fromName: c.fromName || config?.defaultFromName || '',
      html: c.html || '', editorMode: c.editorMode || 'visual',
      filters: { ...EMPTY_FILTERS, ...(c.filters || {}), dateFrom: c.filters?.dateFrom || '', dateTo: c.filters?.dateTo || '' },
      includeEmails: c.includeEmails || [],
    });
    setDirty(false);
  }, [id, config?.defaultFromName]);

  useEffect(() => { load().catch((err) => flash(err.message, true)); }, [load, flash]);
  useEffect(() => { getMailFilterOptions().then(setOptions).catch((err) => flash(err.message, true)); }, [flash]);
  useEffect(() => { if (config?.settings?.testEmail && !testTo) setTestTo(config.settings.testEmail); }, [config, testTo]);

  // Refresco mientras se envía
  useEffect(() => {
    if (campaign?.status !== 'sending') return undefined;
    const t = setInterval(() => { getMailCampaign(id).then((c) => c && setCampaign(c)).catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, [campaign?.status, id]);

  const isDraft = campaign?.status === 'draft';
  const contentEditable = isDraft || campaign?.status === 'paused';

  // Conteo de destinatarios en vivo (solo borradores)
  useEffect(() => {
    if (!draft || !isDraft) return undefined;
    clearTimeout(audienceTimer.current);
    setAudienceLoading(true);
    audienceTimer.current = setTimeout(() => {
      previewMailAudience({ filters: draft.filters, includeEmails: draft.includeEmails })
        .then(setAudience).catch((err) => flash(err.message, true)).finally(() => setAudienceLoading(false));
    }, 350);
    return () => clearTimeout(audienceTimer.current);
  }, [draft?.filters, draft?.includeEmails, isDraft, flash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!campaign || !draft) return e('div', { className: 'mm-body' }, e('p', { className: 'mm-muted' }, 'Cargando campaña…'));

  const update = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const setFilters = (fn) => { setDraft((d) => ({ ...d, filters: typeof fn === 'function' ? fn(d.filters) : fn })); setDirty(true); };
  const setIncludeEmails = (fn) => { setDraft((d) => ({ ...d, includeEmails: typeof fn === 'function' ? fn(d.includeEmails) : fn })); setDirty(true); };

  async function save(silent) {
    setSaving(true);
    try {
      const saved = await updateMailCampaign(id, draft);
      setCampaign(saved);
      setDirty(false);
      if (!silent) flash('Borrador guardado');
      return saved;
    } catch (err) { flash(err.message, true); throw err; } finally { setSaving(false); }
  }

  async function run(key, fn) {
    setBusy(key);
    try { await fn(); } catch (err) { flash(err.message, true); } finally { setBusy(''); }
  }

  const testedAfterEdit = campaign.lastTestAt && !dirty && new Date(campaign.lastTestAt) >= new Date(campaign.updatedAt) - 2000;

  async function sendTest() {
    await run('test', async () => {
      if (dirty) await save(true);
      const r = await sendMailTest(id, { to: testTo });
      flash(`Prueba enviada a ${r.to}${r.sampleName ? ` (con los datos de ${r.sampleName})` : ''}`);
      const c = await getMailCampaign(id);
      if (c) setCampaign(c);
      reloadConfig();
    });
  }

  async function openConfirm() {
    if (!draft.subject.trim()) { flash('Falta el asunto.', true); return; }
    await run('prep', async () => {
      if (dirty) await save(true);
      const a = await previewMailAudience({ filters: draft.filters, includeEmails: draft.includeEmails });
      setAudience(a);
      if (!a.count) throw new Error('No hay destinatarios con estos filtros.');
      setModal('confirm');
    });
  }

  async function confirmSend() {
    await run('send', async () => {
      await startMailCampaign(id, audience.count);
      setModal('');
      flash('Envío iniciado. Sigue solo en segundo plano.');
      await load();
      reloadConfig();
    });
  }

  async function action(key, fn, msg) {
    await run(key, async () => { await fn(id); flash(msg); await load(); reloadConfig(); });
  }

  return e('div', { className: 'mm-body' },
    e('div', { className: 'mm-editor-head' },
      e('button', { type: 'button', className: 'btn ghost sm', onClick: () => (!dirty || window.confirm('Hay cambios sin guardar. ¿Salir igual?')) && onBack() }, e(Icons.ChevronLeft, { width: 14, height: 14 }), 'Campañas'),
      e(StatusPill, { status: campaign.status, waiting: !!campaign.waitingUntil }),
      e('span', { className: 'mm-tb-grow' }),
      contentEditable && e('button', { type: 'button', className: 'btn ghost sm', disabled: saving || !dirty, onClick: () => save(false) }, saving ? 'Guardando…' : dirty ? 'Guardar borrador' : 'Guardado'),
      e('button', { type: 'button', className: 'btn ghost sm', onClick: () => setModal('preview') }, e(Icons.Eye, { width: 14, height: 14 }), 'Vista previa'),
    ),

    campaign.status === 'paused' && campaign.pauseReason && e('p', { className: campaign.autoPaused ? 'error-msg' : 'mm-note' }, campaign.pauseReason),
    campaign.status !== 'draft' && e('section', { className: 'mm-card' },
      e('div', { className: 'mm-stats' },
        [['Destinatarios', campaign.stats?.total], ['Enviados', campaign.stats?.sent], ['Fallidos', campaign.stats?.failed], ['Omitidos', campaign.stats?.skipped]].map(([l, v]) => e('div', { key: l }, e('span', null, l), e('strong', null, v || 0)))),
      e(Progress, { stats: campaign.stats }),
      campaign.waitingUntil && campaign.status === 'sending' && e('p', { className: 'mm-note' }, `Tope diario alcanzado: sigue solo a partir del ${fmtDateTime(campaign.waitingUntil)}.`),
      e('div', { className: 'mm-actions' },
        campaign.status === 'sending' && e('button', { type: 'button', className: 'btn ghost sm', disabled: !!busy, onClick: () => action('pause', pauseMailCampaign, 'Campaña pausada') }, 'Pausar'),
        campaign.status === 'paused' && e('button', { type: 'button', className: 'btn primary sm', disabled: !!busy || dirty, title: dirty ? 'Guardá los cambios primero' : '', onClick: () => action('resume', resumeMailCampaign, 'Campaña reanudada') }, 'Reanudar'),
        ['sending', 'paused'].includes(campaign.status) && e('button', {
          type: 'button', className: 'btn danger sm', disabled: !!busy,
          onClick: () => window.confirm('¿Cancelar la campaña? Los mails pendientes no se van a enviar (no se puede deshacer).') && action('cancel', cancelMailCampaign, 'Campaña cancelada'),
        }, 'Cancelar envío'),
      ),
    ),

    e('section', { className: 'mm-card' },
      e('div', { className: 'mm-form-grid' },
        e('div', { className: 'field' }, e('label', null, 'Nombre interno'),
          e('input', { value: draft.name, disabled: !contentEditable, onChange: (ev) => update({ name: ev.target.value }), placeholder: 'Ej: Novedades octubre' })),
        e('div', { className: 'field' }, e('label', null, 'Remitente visible'),
          e('input', { value: draft.fromName, disabled: !contentEditable, onChange: (ev) => update({ fromName: ev.target.value }) }),
          config?.smtp?.user && e('span', { className: 'mm-muted mm-small' }, `Sale desde ${config.smtp.user}`)),
        e('div', { className: 'field mm-span2' }, e('label', null, 'Asunto'),
          e('input', { value: draft.subject, disabled: !contentEditable, onChange: (ev) => update({ subject: ev.target.value }), placeholder: 'Ej: {{nombre}}, nuevas casas en Mar Azul' })),
        e('div', { className: 'field mm-span2' }, e('label', null, 'Texto de vista previa (opcional, se ve al lado del asunto en la bandeja)'),
          e('input', { value: draft.preheader, disabled: !contentEditable, onChange: (ev) => update({ preheader: ev.target.value }) })),
      ),
      e('div', { className: 'field' }, e('label', null, 'Contenido'),
        e(MailEditor, {
          value: draft.html, mode: draft.editorMode, readOnly: !contentEditable, variables: config?.variables,
          onChange: (html) => update({ html }), onModeChange: (editorMode) => update({ editorMode }),
        }),
        e('span', { className: 'mm-muted mm-small' }, 'Variables: {{nombre}} (si falta se borra: "Hola {{nombre}}," → "Hola,"), {{nombre_completo}}, {{propiedad}}, {{email}}. Texto por defecto: {{nombre|vecino}}. El link de baja se agrega solo al pie.'),
      ),
    ),

    e(AudienceCard, {
      filters: draft.filters, setFilters, includeEmails: draft.includeEmails, setIncludeEmails,
      options, audience, loading: audienceLoading, readOnly: !isDraft, frozenTotal: campaign.stats?.total,
    }),

    isDraft && e('section', { className: 'mm-card' },
      e('h2', null, 'Enviar'),
      e('div', { className: 'mm-send-row' },
        e('div', { className: 'field' }, e('label', null, 'Enviar prueba a'),
          e('input', { type: 'email', value: testTo, onChange: (ev) => setTestTo(ev.target.value) })),
        e('button', { type: 'button', className: 'btn ghost', disabled: !!busy || !config?.smtp?.configured, onClick: sendTest }, busy === 'test' ? 'Enviando…' : 'Enviar prueba'),
      ),
      campaign.lastTestAt && e('p', { className: 'mm-muted mm-small' }, `Última prueba: ${fmtDateTime(campaign.lastTestAt)} a ${campaign.lastTestTo}${testedAfterEdit ? '' : ' (hubo cambios después)'}`),
      !config?.smtp?.configured && e('p', { className: 'error-msg' }, 'La cuenta de envío no está configurada (MKT_SMTP_PASS en el .env del backend).'),
      e('button', {
        type: 'button', className: 'btn primary mm-send-btn', disabled: !!busy || !config?.smtp?.configured || audienceLoading || !audience?.count, onClick: openConfirm,
      }, e(Icons.Send, { width: 15, height: 15 }), busy === 'prep' ? 'Preparando…' : `Enviar campaña${audience?.count ? ` a ${audience.count}` : ''}`),
    ),

    !isDraft && e(SendsCard, { campaign, flash }),
    e(EventsCard, { events: campaign.events }),

    modal === 'preview' && e(PreviewModal, { campaignId: id, draft, onClose: () => setModal('') }),
    modal === 'confirm' && audience && e(ConfirmSendModal, {
      count: audience.count, settings: config?.settings, testedAfterEdit, busy: busy === 'send', onConfirm: confirmSend, onClose: () => setModal(''),
    }),
  );
}

// ── Lista de campañas ────────────────────────────────────────────────────────────────────────────
function CampaignList({ onOpen, flash, reloadConfig }) {
  const [list, setList] = useState(null);

  const load = useCallback(() => getMailCampaigns().then((l) => l && setList(l)).catch((err) => flash(err.message, true)), [flash]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!list?.some((c) => c.status === 'sending')) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [list, load]);

  async function create() {
    try { const c = await createMailCampaign({}); onOpen(c._id); } catch (err) { flash(err.message, true); }
  }
  async function act(fn, msg, c) {
    try { const r = await fn(c._id); flash(msg); if (fn === duplicateMailCampaign) onOpen(r._id); else { load(); reloadConfig(); } } catch (err) { flash(err.message, true); }
  }

  return e('section', { className: 'mm-card' },
    e('div', { className: 'mm-card-head' },
      e('h2', null, 'Campañas'),
      e('button', { type: 'button', className: 'btn primary sm', onClick: create }, e(Icons.Plus, { width: 13, height: 13 }), 'Nueva campaña'),
    ),
    !list ? e('p', { className: 'mm-muted' }, 'Cargando…')
      : !list.length ? e('p', { className: 'mm-empty' }, 'Todavía no hay campañas. Creá la primera.')
        : e('div', { className: 'mm-list' }, list.map((c) => e('article', { key: c._id, className: 'mm-row' },
          e('div', { className: 'mm-row-main', onClick: () => onOpen(c._id), role: 'button', tabIndex: 0, onKeyDown: (ev) => ev.key === 'Enter' && onOpen(c._id) },
            e('div', { className: 'mm-row-top' },
              e('strong', null, c.name || '(sin nombre)'),
              e(StatusPill, { status: c.status, waiting: !!c.waitingUntil }),
            ),
            e('div', { className: 'mm-row-subject' }, c.subject || e('span', { className: 'mm-muted' }, 'Sin asunto')),
            e('div', { className: 'mm-row-meta' },
              e('span', null, c.startedAt ? `Enviada ${fmtDateTime(c.startedAt)}` : `Creada ${fmtDateTime(c.createdAt)}`),
              c.status !== 'draft' && e('span', null, `${c.stats?.total || 0} destinatarios`),
              c.status !== 'draft' && e('span', { className: 'mm-ok' }, `${c.stats?.sent || 0} enviados`),
              c.stats?.failed > 0 && e('span', { className: 'mm-bad' }, `${c.stats.failed} fallidos`),
              c.stats?.skipped > 0 && e('span', null, `${c.stats.skipped} omitidos`),
            ),
            c.status !== 'draft' && e(Progress, { stats: c.stats }),
            (c.status === 'paused' && c.autoPaused) && e('p', { className: 'error-msg mm-small' }, c.pauseReason),
            c.lastEvent && c.status === 'sending' && c.lastEvent.type !== 'info' && e('p', { className: 'mm-note mm-small' }, c.lastEvent.message),
          ),
          e('div', { className: 'mm-row-actions' },
            c.status === 'sending' && e('button', { type: 'button', className: 'btn ghost xs', onClick: () => act(pauseMailCampaign, 'Campaña pausada', c) }, 'Pausar'),
            c.status === 'paused' && e('button', { type: 'button', className: 'btn ghost xs', onClick: () => act(resumeMailCampaign, 'Campaña reanudada', c) }, 'Reanudar'),
            ['sending', 'paused'].includes(c.status) && e('button', {
              type: 'button', className: 'btn ghost xs',
              onClick: () => window.confirm('¿Cancelar la campaña? Los pendientes no se envían.') && act(cancelMailCampaign, 'Campaña cancelada', c),
            }, 'Cancelar'),
            e('button', { type: 'button', className: 'btn ghost xs', title: 'Duplicar como borrador', onClick: () => act(duplicateMailCampaign, 'Campaña duplicada', c) }, e(Icons.Copy, { width: 11, height: 11 }), 'Duplicar'),
            c.status === 'draft' && e('button', {
              type: 'button', className: 'btn ghost xs', title: 'Borrar borrador',
              onClick: () => window.confirm('¿Borrar este borrador?') && act(deleteMailCampaign, 'Borrador eliminado', c),
            }, e(Icons.Trash, { width: 11, height: 11 })),
          ),
        ))),
  );
}

// ── Configuración ────────────────────────────────────────────────────────────────────────────────
function ConfigSection({ config, reloadConfig, flash }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (config) setForm({ ...config.settings }); }, [config]);
  if (!form) return e('section', { className: 'mm-card' }, e('p', { className: 'mm-muted' }, 'Cargando…'));

  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));
  async function save() {
    setSaving(true);
    try { await updateMailConfig(form); flash('Configuración guardada'); reloadConfig(); } catch (err) { flash(err.message, true); } finally { setSaving(false); }
  }

  return e(React.Fragment, null,
    e('section', { className: 'mm-card' },
      e('div', { className: 'mm-card-head' }, e('h2', null, 'Cuenta de envío'),
        e('span', { className: `mm-pill ${config.smtp.configured ? 'mm-pill-finished' : 'mm-pill-cancelled'}` }, config.smtp.configured ? 'Configurada' : 'Sin configurar')),
      e('div', { className: 'mm-kv' },
        e('div', null, e('span', null, 'Cuenta'), e('strong', null, config.smtp.user || '—')),
        e('div', null, e('span', null, 'Cupo últimas 24 h'), e('strong', null, `${config.quota.used} / ${config.quota.limit}`)),
        e('div', null, e('span', null, 'Bajas'), e('strong', null, config.suppressed?.unsubscribed || 0)),
        e('div', null, e('span', null, 'Emails inválidos (rebotes)'), e('strong', null, config.suppressed?.bounced || 0)),
      ),
      !config.smtp.configured && e('p', { className: 'mm-muted' }, 'Cargá la contraseña de aplicación de Google en MKT_SMTP_PASS (Backend/.env) y reiniciá crm-backend.'),
    ),
    e('section', { className: 'mm-card' },
      e('div', { className: 'mm-card-head' }, e('h2', null, 'Ritmo de envío'),
        e('button', { type: 'button', className: 'btn primary sm', disabled: saving, onClick: save }, saving ? 'Guardando…' : 'Guardar')),
      e('p', { className: 'mm-muted' }, 'Gmail permite unos 500 destinatarios por día en una cuenta común. Arrancá bajo y subilo de a poco si no hay rebotes ni bloqueos. Si Gmail avisa de un límite o bloqueo, la campaña se pausa sola.'),
      e('div', { className: 'mm-form-grid' },
        e('div', { className: 'field' }, e('label', null, 'Tope de mails cada 24 h'), e('input', { type: 'number', min: 1, max: 2000, value: form.dailyLimit, onChange: set('dailyLimit') })),
        e('div', { className: 'field' }, e('label', null, 'Intervalo entre mails (segundos, aleatorio)'),
          e('div', { className: 'mm-dates' },
            e('input', { type: 'number', min: 5, value: form.minDelaySec, onChange: set('minDelaySec') }), e('span', null, 'a'),
            e('input', { type: 'number', min: 5, value: form.maxDelaySec, onChange: set('maxDelaySec') }))),
        e('div', { className: 'field' }, e('label', null, 'Email para pruebas'), e('input', { type: 'email', value: form.testEmail || '', onChange: set('testEmail') })),
        e('div', { className: 'field' }, e('label', null, 'Responder a (opcional)'), e('input', { type: 'email', value: form.replyTo || '', onChange: set('replyTo'), placeholder: 'Si las respuestas tienen que ir a otra casilla' })),
      ),
    ),
  );
}

// ── Pestaña ──────────────────────────────────────────────────────────────────────────────────────
export default function MailMarketing({ session }) {
  const [section, setSection] = useState('campaigns');
  const [editingId, setEditingId] = useState(null);
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState(null);

  const flash = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 7000 : 3500);
  }, []);
  const reloadConfig = useCallback(() => { getMailConfig().then((c) => c && setConfig(c)).catch((err) => flash(err.message, true)); }, [flash]);
  useEffect(() => { reloadConfig(); }, [reloadConfig]);

  if (session?.role !== 'SUPERADMIN') return null;

  return e('div', { className: 'mm-root' },
    e('div', { className: 'mm-topbar' },
      e('div', { className: 'mm-topbar-left' },
        e('h1', null, 'Mail Marketing'),
        config && e('span', { className: `mm-pill ${config.smtp.configured ? 'mm-pill-finished' : 'mm-pill-cancelled'}` }, config.smtp.configured ? config.smtp.user : 'Cuenta sin configurar'),
      ),
      config && e('span', { className: 'mm-muted' }, `Cupo 24 h: ${config.quota.used}/${config.quota.limit}`),
    ),
    !editingId && e('div', { className: 'mm-tabs', role: 'tablist' }, [['campaigns', 'Campañas'], ['config', 'Configuración']].map(([k, l]) => e('button', {
      key: k, type: 'button', role: 'tab', 'aria-selected': section === k, className: `mm-tab${section === k ? ' active' : ''}`, onClick: () => setSection(k),
    }, l))),
    editingId
      ? e(CampaignEditor, { key: editingId, id: editingId, config, flash, reloadConfig, onBack: () => setEditingId(null) })
      : e('div', { className: 'mm-body' },
        section === 'campaigns' && e(CampaignList, { onOpen: setEditingId, flash, reloadConfig }),
        section === 'config' && e(ConfigSection, { config, reloadConfig, flash }),
      ),
    toast && e('div', { className: `mm-toast${toast.isError ? ' error' : ''}`, role: 'status' }, toast.msg),
  );
}
