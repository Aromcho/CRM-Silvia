'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import {
  getInstagramStatus, getInstagramConnectUrl, disconnectInstagram, refreshInstagramToken, subscribeInstagramWebhooks,
  getInstagramConfig, updateInstagramConfig, getInstagramLeads, retryInstagramLead, deleteInstagramLead,
  getInstagramMedia, setInstagramMediaProperty, searchInstagramProperties, setInstagramMediaMessage,
} from '@/services/api';
import './InstagramDM.css';

const e = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

const STATUS_LABELS = { pending: 'Pendiente', sent: 'Enviado', failed: 'Error', skipped: 'Omitido' };
const SECTIONS = [
  { key: 'config', label: 'Conexión y mensajes' },
  { key: 'leads', label: 'Leads' },
  { key: 'posts', label: 'Posts y propiedades' },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function Toggle({ on, onClick, disabled, title }) {
  return e('button', { type: 'button', className: `ig-toggle${on ? ' on' : ''}`, onClick, disabled, title, 'aria-pressed': !!on },
    e('span', { className: 'ig-toggle-knob' }));
}

// ── Conexión ─────────────────────────────────────────────────────────────────────────────────────
function ConnectionCard({ status, reload, flash }) {
  const [busy, setBusy] = useState('');
  const acc = status?.account;

  async function run(key, fn, okMsg) {
    setBusy(key);
    try {
      await fn();
      flash(okMsg);
      await reload();
    } catch (err) {
      flash(err.message, true);
    } finally {
      setBusy('');
    }
  }

  if (!status?.connected) {
    return e('section', { className: 'ig-card' },
      e('div', { className: 'ig-card-head' }, e('h2', null, 'Cuenta de Instagram'), e('span', { className: 'ig-pill off' }, 'Desconectada')),
      e('p', { className: 'ig-muted' }, 'Conectá la cuenta profesional de Instagram de la inmobiliaria. Se piden los permisos para leer el perfil, gestionar comentarios y enviar mensajes.'),
      e('a', { className: 'btn primary', href: getInstagramConnectUrl() }, e(Icons.Instagram, { width: 15, height: 15 }), 'Conectar Instagram'),
    );
  }

  const daysLeft = Math.round((new Date(acc.expires_at).getTime() - Date.now()) / 86400e3);
  return e('section', { className: 'ig-card' },
    e('div', { className: 'ig-card-head' },
      e('h2', null, 'Cuenta de Instagram'),
      e('span', { className: 'ig-pill on' }, 'Conectada'),
    ),
    e('div', { className: 'ig-kv' },
      e('div', null, e('span', null, 'Cuenta'), e('strong', null, `@${acc.username}`)),
      e('div', null, e('span', null, 'Token'), e('strong', { className: daysLeft < 10 ? 'ig-warn' : '' }, `Vence el ${fmtDate(acc.expires_at)} (${daysLeft} días)`)),
      e('div', null, e('span', null, 'Webhooks'), e('strong', { className: acc.webhook_subscribed ? '' : 'ig-warn' },
        acc.webhook_subscribed ? `Suscripto (${(acc.subscribed_fields || []).join(', ')})` : 'No suscripto')),
      e('div', null, e('span', null, 'Conectada'), e('strong', null, `${fmtDate(acc.connected_at)}${acc.connected_by ? ` por ${acc.connected_by}` : ''}`)),
    ),
    acc.last_refresh_error && e('p', { className: 'error-msg' }, `Último error al renovar el token: ${acc.last_refresh_error}`),
    acc.subscribe_error && !acc.webhook_subscribed && e('p', { className: 'error-msg' }, `Error al suscribir webhooks: ${acc.subscribe_error}`),
    e('p', { className: 'ig-muted' }, 'El token se renueva solo todos los días cuando le quedan menos de 20 días.'),
    e('div', { className: 'ig-actions' },
      e('button', { type: 'button', className: 'btn ghost sm', disabled: !!busy, onClick: () => run('refresh', refreshInstagramToken, 'Token renovado') },
        e(Icons.RefreshCw, { width: 13, height: 13 }), busy === 'refresh' ? 'Renovando…' : 'Renovar token'),
      e('button', { type: 'button', className: 'btn ghost sm', disabled: !!busy, onClick: () => run('sub', subscribeInstagramWebhooks, 'Webhooks suscriptos') },
        e(Icons.Bell, { width: 13, height: 13 }), busy === 'sub' ? 'Suscribiendo…' : 'Suscribir webhooks'),
      e('a', { className: 'btn ghost sm', href: getInstagramConnectUrl() }, e(Icons.Instagram, { width: 13, height: 13 }), 'Reconectar'),
      e('button', {
        type: 'button', className: 'btn danger sm', disabled: !!busy,
        onClick: () => window.confirm('¿Desconectar Instagram? La automatización se apaga.') && run('disc', disconnectInstagram, 'Instagram desconectado'),
      }, busy === 'disc' ? 'Desconectando…' : 'Desconectar'),
    ),
  );
}

// ── Configuración: interruptor, reglas y textos ─────────────────────────────────────────────────
function ConfigCard({ status, reload, flash }) {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getInstagramConfig().then((c) => c && setConfig({ ...c, rules: c.rules.map((r) => ({ ...r, keywordsText: (r.keywords || []).join(', ') })) }))
      .catch((err) => flash(err.message, true));
  }, [flash]);

  if (!config) return e('section', { className: 'ig-card' }, e('p', { className: 'ig-muted' }, 'Cargando configuración…'));

  const update = (patch) => { setConfig((c) => ({ ...c, ...patch })); setDirty(true); };
  const updateRule = (i, patch) => update({ rules: config.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const pending = config.rules.filter((r) => r.active !== false && /COMPLETAR/.test(r.message || ''));

  async function toggleEnabled() {
    const next = !config.enabled;
    if (next) {
      if (!status?.connected) { flash('Primero conectá Instagram.', true); return; }
      if (pending.length) { flash(`Completá los textos marcados "COMPLETAR" (${pending.map((r) => r.label || r.key).join(', ')}) antes de encender.`, true); return; }
      if (dirty) { flash('Guardá los cambios antes de encender.', true); return; }
      if (!window.confirm('Antes de encender: ¿ya apagaste CreatorFlow y las automatizaciones nativas de Meta con las mismas keywords? Si no, el usuario va a recibir dos mensajes.')) return;
    }
    try {
      const saved = await updateInstagramConfig({ enabled: next });
      setConfig((c) => ({ ...c, enabled: saved.enabled }));
      flash(saved.enabled ? 'Automatización ENCENDIDA' : 'Automatización apagada');
      reload();
    } catch (err) { flash(err.message, true); }
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await updateInstagramConfig({
        rules: config.rules.map((r) => ({ key: r.key, label: r.label, keywords: r.keywordsText.split(','), message: r.message, active: r.active !== false })),
        propertyLinkTemplate: config.propertyLinkTemplate,
        ...(config.saleContacts !== undefined ? { saleContacts: config.saleContacts } : {}),
        publicReplyEnabled: config.publicReplyEnabled,
        publicReplies: config.publicReplies,
      });
      setConfig({ ...saved, rules: saved.rules.map((r) => ({ ...r, keywordsText: (r.keywords || []).join(', ') })) });
      setDirty(false);
      flash('Configuración guardada');
    } catch (err) { flash(err.message, true); } finally { setSaving(false); }
  }

  const replies = [0, 1, 2].map((i) => (config.publicReplies || [])[i] || '');

  return e(React.Fragment, null,
    e('section', { className: `ig-card ig-switch-card${config.enabled ? ' is-on' : ''}` },
      e('div', null,
        e('h2', null, 'Automatización comentario → DM'),
        e('p', { className: 'ig-muted' }, config.enabled
          ? 'Encendida: cada comentario con una keyword recibe el mensaje por DM.'
          : 'Apagada: los comentarios con keyword se registran como "Omitido", sin enviar nada.'),
      ),
      e(Toggle, { on: config.enabled, onClick: toggleEnabled, title: config.enabled ? 'Apagar' : 'Encender' }),
    ),

    e('section', { className: 'ig-card' },
      e('div', { className: 'ig-card-head' },
        e('h2', null, 'Keywords y mensajes'),
        e('button', { type: 'button', className: 'btn primary sm', disabled: saving || !dirty, onClick: save }, saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'),
      ),
      e('p', { className: 'ig-muted' }, 'Se comparan sin mayúsculas, tildes, emojis ni signos, como palabra completa. Se evalúan en orden: gana la primera regla que matchea. Separá las keywords con comas.'),
      config.rules.map((r, i) => e('div', { key: r.key, className: 'ig-rule' },
        e('div', { className: 'ig-rule-head' },
          e('input', { className: 'ig-rule-label', value: r.label || '', onChange: (ev) => updateRule(i, { label: ev.target.value }) }),
          e('label', { className: 'ig-inline' }, e(Toggle, { on: r.active !== false, onClick: () => updateRule(i, { active: r.active === false }) }), 'Activa'),
        ),
        e('div', { className: 'field' }, e('label', null, 'Keywords'),
          e('input', { value: r.keywordsText, onChange: (ev) => updateRule(i, { keywordsText: ev.target.value }), placeholder: 'info, informacion' })),
        e('div', { className: 'field' }, e('label', null, 'Mensaje por DM'),
          e('textarea', { rows: 6, value: r.message || '', onChange: (ev) => updateRule(i, { message: ev.target.value }) }),
          /COMPLETAR/.test(r.message || '') && e('span', { className: 'ig-warn ig-small' }, 'Falta completar este texto (contiene "COMPLETAR").'),
        ),
      )),
      e('div', { className: 'field' }, e('label', null, 'Texto agregado cuando el post está asociado a una propiedad ({link} = ficha en la web)'),
        e('textarea', { rows: 2, value: config.propertyLinkTemplate || '', onChange: (ev) => update({ propertyLinkTemplate: ev.target.value }) })),
      e('div', { className: 'field' }, e('label', null, 'Contactos del mensaje de posts de propiedades en VENTA (uno por línea, "Nombre: +54 9 ..."). En alquiler se usa el mensaje de la regla de alquileres.'),
        e('textarea', { rows: 5, value: config.saleContacts ?? 'Silvia: +54 9 225550-9408\nFabiana: +54 9 2255 62-6092\nPablo: +54 9 2255 60-9992\nCecilia: +54 9 2216 00-6474\nPaul: +54 9 2254 60-2453\nValentin: +54 9 2255 62-2841', onChange: (ev) => update({ saleContacts: ev.target.value }) })),
    ),

    e('section', { className: 'ig-card' },
      e('div', { className: 'ig-card-head' },
        e('h2', null, 'Respuesta pública al comentario'),
        e('label', { className: 'ig-inline' }, e(Toggle, { on: config.publicReplyEnabled, onClick: () => update({ publicReplyEnabled: !config.publicReplyEnabled }) }), config.publicReplyEnabled ? 'Activada' : 'Desactivada'),
      ),
      e('p', { className: 'ig-muted' }, 'Opcional. Después de mandar el DM se responde el comentario rotando estas 3 variantes. Guardá los cambios con el botón de arriba.'),
      replies.map((t, i) => e('input', {
        key: i, className: 'ig-reply-input', value: t, placeholder: `Variante ${i + 1}`,
        onChange: (ev) => update({ publicReplies: replies.map((x, j) => (j === i ? ev.target.value : x)) }),
      })),
    ),
  );
}

// ── Leads ────────────────────────────────────────────────────────────────────────────────────────
function LeadsSection({ flash }) {
  const [filters, setFilters] = useState({ status: '', rule: '', search: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      setData(await getInstagramLeads(params));
    } catch (err) { flash(err.message, true); } finally { setLoading(false); }
  }, [filters, page, flash]);

  useEffect(() => { load(); }, [load]);

  const setF = (k) => (ev) => { setPage(1); setFilters((f) => ({ ...f, [k]: ev.target.value })); };

  async function retry(id) {
    try { await retryInstagramLead(id); flash('Reintento enviado'); load(); } catch (err) { flash(err.message, true); }
  }
  async function remove(id) {
    if (!window.confirm('¿Borrar este lead?')) return;
    try { await deleteInstagramLead(id); load(); } catch (err) { flash(err.message, true); }
  }

  return e('section', { className: 'ig-card' },
    e('div', { className: 'ig-filters' },
      e('div', { className: 'search' }, e(Icons.Search, { width: 15, height: 15 }),
        e('input', { value: filters.search, onChange: setF('search'), placeholder: 'Usuario o comentario' })),
      e('select', { value: filters.status, onChange: setF('status') },
        e('option', { value: '' }, 'Todos los estados'),
        Object.entries(STATUS_LABELS).map(([k, v]) => e('option', { key: k, value: k }, v))),
      e('select', { value: filters.rule, onChange: setF('rule') },
        e('option', { value: '' }, 'Todas las reglas'),
        e('option', { value: 'info' }, 'Info'),
        e('option', { value: 'alquiler' }, 'Alquiler')),
      e('label', { className: 'ig-date' }, 'Desde', e('input', { type: 'date', value: filters.from, onChange: setF('from') })),
      e('label', { className: 'ig-date' }, 'Hasta', e('input', { type: 'date', value: filters.to, onChange: setF('to') })),
      e('button', { type: 'button', className: 'btn ghost sm', onClick: load, disabled: loading }, e(Icons.RefreshCw, { width: 13, height: 13 }), 'Actualizar'),
    ),
    !data ? e('p', { className: 'ig-muted' }, 'Cargando…')
      : !data.docs.length ? e('p', { className: 'ig-empty' }, 'Todavía no hay leads con estos filtros.')
        : e('div', { className: 'ig-leads' }, data.docs.map((l) => e('article', { key: l._id, className: 'ig-lead' },
          e('div', { className: 'ig-lead-top' },
            e('a', { href: `https://www.instagram.com/${l.ig_username}/`, target: '_blank', rel: 'noopener noreferrer', className: 'ig-lead-user' }, `@${l.ig_username || l.ig_user_id}`),
            e('span', { className: `ig-status ig-status-${l.status}` }, STATUS_LABELS[l.status] || l.status),
            e('span', { className: 'ig-chip' }, `${l.rule_key} · "${l.keyword}"`),
            e('span', { className: 'ig-lead-date' }, fmtDateTime(l.createdAt)),
          ),
          e('p', { className: 'ig-lead-comment' }, `“${l.comment_text}”`),
          e('div', { className: 'ig-lead-meta' },
            l.property && e('a', { href: l.property.url, target: '_blank', rel: 'noopener noreferrer' }, e(Icons.Building, { width: 12, height: 12 }), `#${l.property.id} ${l.property.title}`),
            l.permalink && e('a', { href: l.permalink, target: '_blank', rel: 'noopener noreferrer' }, e(Icons.ExternalLink, { width: 12, height: 12 }), 'Ver post'),
            l.attempts > 0 && e('span', null, `${l.attempts} intento${l.attempts === 1 ? '' : 's'}`),
            l.public_reply_status !== 'none' && e('span', null, `Respuesta pública: ${l.public_reply_status === 'sent' ? 'enviada' : 'error'}`),
          ),
          l.skip_reason && e('p', { className: 'ig-muted ig-small' }, l.skip_reason),
          l.error && e('p', { className: 'error-msg ig-small' }, l.error),
          e('div', { className: 'ig-actions' },
            ['failed', 'skipped'].includes(l.status) && e('button', { type: 'button', className: 'btn ghost xs', onClick: () => retry(l._id) }, 'Enviar ahora'),
            e('button', { type: 'button', className: 'btn ghost xs', onClick: () => remove(l._id) }, e(Icons.Trash, { width: 11, height: 11 })),
          ),
        ))),
    data && data.totalPages > 1 && e('div', { className: 'ig-pager' },
      e('button', { type: 'button', className: 'btn ghost sm', disabled: !data.hasPrevPage, onClick: () => setPage((p) => p - 1) }, 'Anterior'),
      e('span', null, `Página ${data.page} de ${data.totalPages} · ${data.totalDocs} leads`),
      e('button', { type: 'button', className: 'btn ghost sm', disabled: !data.hasNextPage, onClick: () => setPage((p) => p + 1) }, 'Siguiente'),
    ),
  );
}

// ── Posts ↔ propiedades ──────────────────────────────────────────────────────────────────────────
function PropertyPicker({ media, onSaved, flash }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      searchInstagramProperties(q).then((r) => setResults(r || [])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q, open]);

  async function assign(propertyId) {
    try {
      const res = await setInstagramMediaProperty(media.id, {
        propertyId, permalink: media.permalink, caption: media.caption, thumbnail_url: media.thumbnail_url || media.media_url, media_product_type: media.media_product_type,
      });
      onSaved(res.property, res.default_message);
      setOpen(false);
      setQ('');
    } catch (err) { flash(err.message, true); }
  }

  return e('div', { className: 'ig-picker' },
    media.property
      ? e('div', { className: 'ig-picker-current' },
        e('span', null, e(Icons.Building, { width: 12, height: 12 }), ` #${media.property.id} ${media.property.title}`),
        e('button', { type: 'button', className: 'btn ghost xs', onClick: () => setOpen((v) => !v) }, 'Cambiar'),
        e('button', { type: 'button', className: 'btn ghost xs', onClick: () => assign(null) }, 'Quitar'))
      : e('button', { type: 'button', className: 'btn ghost xs', onClick: () => setOpen((v) => !v) }, e(Icons.Plus, { width: 11, height: 11 }), 'Asociar propiedad'),
    open && e('div', { className: 'ig-picker-pop' },
      e('input', { autoFocus: true, value: q, onChange: (ev) => setQ(ev.target.value), placeholder: 'Buscar por ID, título o dirección' }),
      e('div', { className: 'ig-picker-list' },
        results.length ? results.map((p) => e('button', { key: p.id, type: 'button', onClick: () => assign(p.id) },
          e('strong', null, `#${p.id}`), ` ${p.title}`, p.operation && e('span', { className: 'ig-muted' }, ` · ${p.operation}`)))
          : e('p', { className: 'ig-muted ig-small' }, 'Sin resultados')),
    ),
  );
}

// Mensaje propio de cada post: si está cargado, es el DM que reciben los que comentan una keyword en ese post.
function MessageEditor({ media, onSaved, flash }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const hasCustom = !!media.custom_message;

  function start() {
    setText(media.custom_message || media.default_message || '');
    setOpen(true);
  }

  async function save(value) {
    setSaving(true);
    try {
      const res = await setInstagramMediaMessage(media.id, {
        message: value, permalink: media.permalink, caption: media.caption, thumbnail_url: media.thumbnail_url || media.media_url, media_product_type: media.media_product_type,
      });
      onSaved(res.custom_message || '');
      setOpen(false);
      flash(value ? 'Mensaje del post guardado' : 'El post vuelve al mensaje general');
    } catch (err) { flash(err.message, true); } finally { setSaving(false); }
  }

  return e('div', { className: 'ig-msg-editor' },
    !open && e('div', { className: 'ig-picker-current' },
      hasCustom && e('span', { className: 'ig-chip' }, 'Mensaje propio'),
      e('button', { type: 'button', className: 'btn ghost xs', onClick: start }, 'Editar mensaje'),
      hasCustom && e('button', { type: 'button', className: 'btn ghost xs', disabled: saving, onClick: () => save('') }, 'Restablecer')),
    open && e('div', { className: 'field' },
      e('label', null, 'DM para este post (el link a la ficha se agrega solo)'),
      e('textarea', { rows: 8, value: text, onChange: (ev) => setText(ev.target.value) }),
      e('div', { className: 'ig-actions' },
        e('button', { type: 'button', className: 'btn primary xs', disabled: saving || !text.trim(), onClick: () => save(text) }, saving ? 'Guardando…' : 'Guardar'),
        e('button', { type: 'button', className: 'btn ghost xs', disabled: saving, onClick: () => setOpen(false) }, 'Cancelar'))),
  );
}

function PostsSection({ status, flash }) {
  const [media, setMedia] = useState(null);
  const [paging, setPaging] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (after) => {
    setLoading(true);
    setError('');
    try {
      const res = await getInstagramMedia(after ? { after } : {});
      setMedia((m) => (after ? [...(m || []), ...res.data] : res.data));
      setPaging(res.paging);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (status?.connected) load(); }, [status?.connected, load]);

  if (!status?.connected) return e('section', { className: 'ig-card' }, e('p', { className: 'ig-empty' }, 'Conectá Instagram para listar los posts.'));

  return e('section', { className: 'ig-card' },
    e('p', { className: 'ig-muted' }, 'Asociá cada post o reel a una propiedad del CRM: el DM va a incluir el link a la ficha y el lead queda vinculado.'),
    error && e('p', { className: 'error-msg' }, error),
    !media ? e('p', { className: 'ig-muted' }, 'Cargando posts…') : e('div', { className: 'ig-media-grid' }, media.map((m) => e('article', { key: m.id, className: 'ig-media' },
      e('a', { href: m.permalink, target: '_blank', rel: 'noopener noreferrer', className: 'ig-media-thumb' },
        (m.thumbnail_url || (m.media_type !== 'VIDEO' && m.media_url))
          ? e('img', { src: m.thumbnail_url || m.media_url, alt: '', loading: 'lazy' })
          : e(Icons.Image, { width: 28, height: 28 }),
        e('span', { className: 'ig-media-type' }, m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrusel' : 'Post'),
      ),
      e('div', { className: 'ig-media-body' },
        e('p', { className: 'ig-media-caption' }, (m.caption || 'Sin texto').slice(0, 140)),
        e('span', { className: 'ig-muted ig-small' }, fmtDate(m.timestamp)),
        e(PropertyPicker, { media: m, flash, onSaved: (property, defaultMessage) => setMedia((list) => list.map((x) => (x.id === m.id ? { ...x, property, default_message: defaultMessage ?? x.default_message } : x))) }),
        e(MessageEditor, { media: m, flash, onSaved: (customMessage) => setMedia((list) => list.map((x) => (x.id === m.id ? { ...x, custom_message: customMessage } : x))) }),
      ),
    ))),
    paging?.cursors?.after && paging?.next && e('div', { className: 'ig-pager' },
      e('button', { type: 'button', className: 'btn ghost sm', disabled: loading, onClick: () => load(paging.cursors.after) }, loading ? 'Cargando…' : 'Cargar más')),
  );
}

// ── Pestaña ──────────────────────────────────────────────────────────────────────────────────────
export default function InstagramDM() {
  const [section, setSection] = useState('config');
  const [status, setStatus] = useState(null);
  const [toast, setToast] = useState(null);

  const flash = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), isError ? 7000 : 3500);
  }, []);

  const reload = useCallback(async () => {
    try { setStatus(await getInstagramStatus()); } catch (err) { flash(err.message, true); }
  }, [flash]);

  useEffect(() => { reload(); }, [reload]);

  // Vuelta del OAuth: /?tab=instagram&ig=ok|error&msg=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('ig');
    if (!result) return;
    flash(result === 'ok' ? 'Instagram conectado' : `No se pudo conectar Instagram: ${params.get('msg') || 'error desconocido'}`, result !== 'ok');
    window.history.replaceState(null, '', '/?tab=instagram');
  }, [flash]);

  const counts = status?.leadCounts || {};
  return e('div', { className: 'ig-dm' },
    e('div', { className: 'ig-toolbar' },
      e('div', { className: 'ig-toolbar-left' },
        e('h1', null, 'Instagram DM'),
        status && e('span', { className: `ig-pill ${status.enabled ? 'on' : 'off'}` }, status.enabled ? 'Encendida' : 'Apagada'),
        status?.connected && e('span', { className: 'ig-muted' }, `@${status.account.username}`),
      ),
      e('div', { className: 'ig-counts' },
        ['sent', 'failed', 'skipped'].map((k) => e('span', { key: k, className: `ig-status ig-status-${k}` }, `${STATUS_LABELS[k]}: ${counts[k] || 0}`))),
    ),
    e('div', { className: 'ig-tabs', role: 'tablist' }, SECTIONS.map((s) => e('button', {
      key: s.key, type: 'button', role: 'tab', 'aria-selected': section === s.key,
      className: `ig-tab${section === s.key ? ' active' : ''}`, onClick: () => setSection(s.key),
    }, s.label))),
    e('div', { className: 'ig-body' },
      section === 'config' && e(React.Fragment, null,
        e(ConnectionCard, { status, reload, flash }),
        e(ConfigCard, { status, reload, flash }),
      ),
      section === 'leads' && e(LeadsSection, { flash }),
      section === 'posts' && e(PostsSection, { status, flash }),
    ),
    toast && e('div', { className: `ig-toast${toast.isError ? ' error' : ''}`, role: 'status' }, toast.msg),
  );
}
