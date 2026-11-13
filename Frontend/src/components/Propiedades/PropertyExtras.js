'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { channelsOf, healthOf } from '@/lib/propertyHealth';
import { getLeads, getPropertyDocuments, uploadPropertyDocuments, deletePropertyDocument, propertyDocumentUrl } from '@/services/api';
import { LEAD_STATUS_LABELS } from '@/lib/data';
import './PropertyExtras.css';

// Piezas de la ficha de propiedad (C4 y C12): estado de salud y canales arriba, consultas de esta
// propiedad y documentos privados.

const e = React.createElement;
const { useState, useEffect, useRef } = React;

// ── Salud y canales ─────────────────────────────────────────────────────────────────────────────

// A qué pestaña lleva cada cosa que falta
const FIX_TAB = { photos: 'fotos', video: 'videos', map: 'mapa', title: 'detalles', description: 'detalles', sea: 'detalles' };
const FIX_HINT = {
  photos: 'Subí al menos 5 fotos', video: 'Agregá un reel, un YouTube o un MP4', map: 'Marcá la ubicación en el mapa',
  title: 'Escribí el título arriba', description: 'Completá la descripción (más de 80 letras)', sea: 'Cargá la distancia al mar en «Detalles»',
};

function channelChip(key, name, ch, onOpenDifusion) {
  const state = key === 'web' ? (ch.on ? 'on' : 'off') : ch.state;
  const label = key === 'web' ? (ch.on ? 'Se ve' : 'Oculta') : ch.label;
  const title = key === 'web'
    ? (ch.on ? 'Se muestra en la web' : 'No se muestra en la web por su estado')
    : `${name}: ${ch.label}${ch.detail ? ` — ${ch.detail}` : ''}`;
  const body = [e('b', { key: 'n' }, name), e('span', { key: 'l' }, label)];
  if (key !== 'web' && ch.state === 'on' && ch.url) {
    return e('a', { key, className: `ph-ch ${state}`, href: ch.url, target: '_blank', rel: 'noopener noreferrer', title: `${title} (abrir el aviso)` }, ...body);
  }
  if (key !== 'web') {
    return e('button', { key, type: 'button', className: `ph-ch ${state}`, title, onClick: onOpenDifusion }, ...body);
  }
  return e('span', { key, className: `ph-ch ${state}`, title }, ...body);
}

export function PropertyHealthStrip({ property, onGoTab }) {
  const ch = channelsOf(property);
  const health = healthOf(property);
  const tone = health.percent >= 100 ? 'ok' : health.percent >= 60 ? 'mid' : 'low';
  const errors = [ch.ml, ch.zp].filter((c) => c.state === 'error');

  return e('div', { className: 'ph-strip' },
    e('div', { className: 'ph-channels', 'aria-label': 'Dónde está publicada' },
      channelChip('web', 'Web', ch.web),
      channelChip('ml', 'MercadoLibre', ch.ml, () => onGoTab('difusion')),
      channelChip('zp', 'ZonaProp', ch.zp, () => onGoTab('difusion')),
    ),
    e('div', { className: `ph-health ${tone}` },
      e('div', { className: 'ph-health-head' },
        e('span', { className: 'ph-health-title' }, health.percent >= 100 ? 'Ficha completa' : `Ficha al ${health.percent}%`),
        e('span', { className: 'ph-bar', role: 'progressbar', 'aria-valuenow': health.percent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
          e('span', { style: { width: `${health.percent}%` } })),
      ),
      health.missing.length > 0 && e('div', { className: 'ph-missing' },
        health.missing.map((m) => e('button', {
          key: m.key, type: 'button', className: 'ph-fix', title: FIX_HINT[m.key] || '',
          onClick: () => onGoTab(FIX_TAB[m.key] || 'detalles'),
        }, m.label, e(Icons.Chevron, { width: 12, height: 12 }))),
      ),
    ),
    errors.length > 0 && e('button', { type: 'button', className: 'ph-error', onClick: () => onGoTab('difusion') },
      e(Icons.AlertTriangle, { width: 14, height: 14 }),
      e('span', null, errors.map((c) => c.detail || c.label).join(' · ')),
      e('b', null, 'Ver en Difusión'),
    ),
  );
}

// ── Consultas de esta propiedad ─────────────────────────────────────────────────────────────────

const SOURCE = { manual: 'Carga manual', mercadolibre: 'MercadoLibre', zonaprop: 'ZonaProp', web: 'Web', whatsapp: 'WhatsApp', instagram: 'Instagram', otro: 'Otro' };

function ago(date) {
  const d = new Date(date);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) {
    const h = Math.floor((Date.now() - d.getTime()) / 3600000);
    return h < 1 ? 'recién' : `hace ${h} h`;
  }
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

const digits = (v) => String(v || '').replace(/\D/g, '');
function waNumber(phone) {
  let d = digits(phone);
  if (!d) return '';
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('54')) d = `549${d}`;
  return d;
}

export function PropertyLeads({ property, setTab }) {
  const [state, setState] = useState({ loading: true, error: '', leads: [], total: 0 });

  useEffect(() => {
    let cancelled = false;
    getLeads({ propertyId: property.id, limit: 100 })
      .then((res) => { if (!cancelled) setState({ loading: false, error: '', leads: res?.objects || [], total: res?.meta?.total || 0 }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message || 'No se pudieron cargar las consultas', leads: [], total: 0 }); });
    return () => { cancelled = true; };
  }, [property.id]);

  if (state.loading) return e('div', { className: 'pl-empty' }, 'Cargando consultas…');
  if (state.error) return e('div', { className: 'pl-empty error' }, state.error);
  if (!state.leads.length) {
    return e('div', { className: 'pl-empty' },
      e('strong', null, 'Todavía nadie consultó por esta propiedad.'),
      e('span', null, 'Las consultas de MercadoLibre, ZonaProp, la web e Instagram aparecen acá solas.'));
  }

  const bySource = state.leads.reduce((acc, l) => { acc[l.source] = (acc[l.source] || 0) + 1; return acc; }, {});
  const pending = state.leads.filter((l) => l.status === 'nuevo').length;

  return e('div', { className: 'pl' },
    e('div', { className: 'pl-summary' },
      e('span', null, e('b', null, state.total), ` consulta${state.total === 1 ? '' : 's'}`),
      pending > 0 && e('span', { className: 'pl-pending' }, `${pending} sin responder`),
      Object.entries(bySource).map(([s, n]) => e('span', { key: s, className: 'pl-src' }, `${SOURCE[s] || s} ${n}`)),
      setTab && e('button', { type: 'button', className: 'btn ghost xs pl-open', onClick: () => setTab('leads') }, 'Ir a Consultas'),
    ),
    e('div', { className: 'pl-list' },
      state.leads.map((l) => {
        const wa = waNumber(l.phone);
        return e('div', { key: l._id, className: `pl-row status-${l.status}` },
          e('div', { className: 'pl-main' },
            e('div', { className: 'pl-top' },
              e('span', { className: 'pl-name' }, l.name || l.email || l.phone || 'Sin nombre'),
              e('span', { className: `pl-status s-${l.status}` }, LEAD_STATUS_LABELS[l.status] || (l.status === 'historico' ? 'Histórica' : l.status)),
            ),
            e('div', { className: 'pl-meta' },
              e('span', null, SOURCE[l.source] || l.source),
              e('span', null, ago(l.createdAt)),
              l.assignedTo?.name && e('span', null, `Asesor: ${l.assignedTo.name}`),
            ),
            l.message && e('p', { className: 'pl-msg' }, String(l.message).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)),
          ),
          e('div', { className: 'pl-actions' },
            wa && e('a', { className: 'btn primary xs', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener noreferrer' }, e(Icons.WhatsApp, { width: 12, height: 12 }), 'WhatsApp'),
            l.phone && e('a', { className: 'btn ghost xs', href: `tel:${digits(l.phone)}` }, 'Llamar'),
            l.email && e('a', { className: 'btn ghost xs', href: `mailto:${l.email}` }, 'Email'),
          ),
        );
      }),
    ),
  );
}

// ── Documentos ──────────────────────────────────────────────────────────────────────────────────

const KIND_LABELS = { autorizacion: 'Autorización', escritura: 'Escritura', plano: 'Plano', tasacion: 'Tasación', contrato: 'Contrato', otro: 'Otro' };

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PropertyDocuments({ property, session }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('autorizacion');
  const [adminOnly, setAdminOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const fileRef = useRef(null);

  async function load() {
    try {
      const res = await getPropertyDocuments(property.id);
      setDocs(res?.documents || []);
      setCanAdmin(Boolean(res?.canSeeAdminOnly));
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los documentos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setLoading(true); load(); }, [property.id]);

  async function onFiles(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    if (!files.length) return;
    const tooBig = files.find((f) => f.size > 50 * 1024 * 1024);
    if (tooBig) { setError(`«${tooBig.name}» pesa más de 50 MB.`); return; }
    setBusy(true); setError('');
    try {
      await uploadPropertyDocuments(property.id, files, { kind, adminOnly });
      await load();
    } catch (err) {
      setError(err.message || 'No se pudieron subir los documentos');
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc) {
    if (!confirm(`¿Borrar «${doc.name}»? No se puede recuperar.`)) return;
    try {
      await deletePropertyDocument(property.id, doc._id);
      setDocs((list) => list.filter((d) => d._id !== doc._id));
    } catch (err) {
      setError(err.message || 'No se pudo borrar');
    }
  }

  return e('div', { className: 'pd' },
    e('div', { className: 'pd-add' },
      e('label', { className: 'pd-field' }, 'Tipo',
        e('select', { value: kind, onChange: (ev) => setKind(ev.target.value), disabled: busy },
          Object.entries(KIND_LABELS).map(([k, v]) => e('option', { key: k, value: k }, v)))),
      canAdmin && e('label', { className: 'pd-check' },
        e('input', { type: 'checkbox', checked: adminOnly, onChange: (ev) => setAdminOnly(ev.target.checked), disabled: busy }),
        'Solo administradores'),
      e('button', { type: 'button', className: 'btn primary sm', disabled: busy, onClick: () => fileRef.current?.click() },
        e(Icons.Upload, { width: 13, height: 13 }), busy ? 'Subiendo…' : 'Subir documentos'),
      e('input', { ref: fileRef, type: 'file', multiple: true, hidden: true, accept: '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.odt,.ods,.txt,.dwg,.dxf,.zip', onChange: onFiles }),
    ),
    e('p', { className: 'pd-hint' }, 'Privados: no se publican en ningún lado y solo se bajan con sesión del CRM. PDF, fotos, Word, Excel o planos, hasta 50 MB.'),
    error && e('div', { className: 'pd-error' }, error),
    loading
      ? e('div', { className: 'pl-empty' }, 'Cargando…')
      : docs.length === 0
        ? e('div', { className: 'pl-empty' },
            e('strong', null, 'Sin documentos todavía.'),
            e('span', null, 'Autorización de venta, escritura, planos, tasación: todo queda guardado acá, en la propiedad.'))
        : e('div', { className: 'pd-list' },
            docs.map((d) => e('div', { key: d._id, className: 'pd-row' },
              e('span', { className: `pd-kind k-${d.kind}` }, KIND_LABELS[d.kind] || 'Otro'),
              e('div', { className: 'pd-info' },
                e('a', { href: propertyDocumentUrl(property.id, d._id, true), target: '_blank', rel: 'noopener noreferrer', className: 'pd-name' }, d.name),
                e('span', { className: 'pd-meta' },
                  [fmtSize(d.size), d.uploadedBy, new Date(d.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · '),
                  d.adminOnly ? ' · solo admin' : ''),
              ),
              e('div', { className: 'pd-actions' },
                e('a', { className: 'btn ghost xs', href: propertyDocumentUrl(property.id, d._id), title: 'Descargar' }, e(Icons.Download, { width: 12, height: 12 }), 'Bajar'),
                (canAdmin || d.uploadedBy === session?.name) && e('button', { type: 'button', className: 'btn danger xs', onClick: () => remove(d), title: 'Borrar' }, e(Icons.Trash, { width: 12, height: 12 })),
              ),
            )),
          ),
  );
}
