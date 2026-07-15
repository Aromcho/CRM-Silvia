'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { getLeads, createLead, updateLead, updateLeadStatus, deleteLead, getUsers } from '@/services/api';
import './Leads.css';

const e = React.createElement;
const { useState, useEffect, useCallback } = React;

const STATUS_OPTS = [
  { key: 'all', label: 'Todos' },
  { key: 'nuevo', label: 'Nuevo' },
  { key: 'en_progreso', label: 'En progreso' },
  { key: 'contactado', label: 'Contactado' },
  { key: 'reservado', label: 'Reservado' },
  { key: 'cerrado', label: 'Cerrado' },
  { key: 'descartado', label: 'Descartado' },
];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTS.filter((s) => s.key !== 'all').map((s) => [s.key, s.label]));
const SOURCE_OPTS = ['manual', 'mercadolibre', 'zonaprop', 'web', 'whatsapp', 'otro'];

const AVATAR_PALETTE = ['#15784f', '#2563eb', '#b8791b', '#7257c9', '#0e8a8a', '#d8504a'];
function colorOf(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return (p[0]?.[0] || '?') + (p[1]?.[0] || '');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `${hs}h`;
  const days = Math.floor(hs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('es-AR');
}

function LeadModal({ lead: initialLead, onClose, onUpdated }) {
  const [lead, setLead] = useState(initialLead);
  const [notes, setNotes] = useState(initialLead.notes || '');
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => { getUsers().then((u) => setUsers(u || [])).catch(() => {}); }, []);

  async function handleAssign(userId) {
    setSaving(true);
    try {
      const updated = await updateLead(lead._id, { assignedTo: userId || null });
      setLead(updated);
      onUpdated && onUpdated(updated);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(newStatus) {
    setSaving(true);
    try {
      const updated = await updateLeadStatus(lead._id, newStatus);
      setLead((l) => ({ ...l, status: newStatus }));
      onUpdated && onUpdated({ ...lead, status: newStatus });
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleSaveNotes() {
    setSaving(true);
    try {
      await updateLead(lead._id, { notes });
      onUpdated && onUpdated({ ...lead, notes });
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el lead de ${lead.name}?`)) return;
    await deleteLead(lead._id).catch(console.error);
    onUpdated && onUpdated(null, true);
    onClose();
  }

  return e('div', { className: 'lead-modal-overlay', onClick: onClose },
    e('div', { className: 'lead-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'lead-modal-head' },
        e('h2', null, lead.name),
        e('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          e('span', { className: `status-badge badge-${lead.status}` }, STATUS_LABELS[lead.status] || lead.status),
          e('button', { className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
        ),
      ),
      e('div', { className: 'lead-modal-body' },
        e('div', { className: 'lead-info-row' }, e('span', { className: 'lead-info-icon' }, e(Icons.Mail, { width: 14, height: 14 })), e('span', { className: 'lead-info-label' }, 'Email'), e('span', { className: 'lead-info-value' }, lead.email)),
        lead.phone && e('div', { className: 'lead-info-row' }, e('span', { className: 'lead-info-icon' }, e(Icons.Phone, { width: 14, height: 14 })), e('span', { className: 'lead-info-label' }, 'Teléfono'), e('span', { className: 'lead-info-value' }, lead.phone)),
        lead.propertyTitle && e('div', { className: 'lead-info-row' }, e('span', { className: 'lead-info-icon' }, e(Icons.Building, { width: 14, height: 14 })), e('span', { className: 'lead-info-label' }, 'Propiedad'), e('span', { className: 'lead-info-value' }, lead.propertyTitle)),
        e('div', { className: 'lead-info-row' }, e('span', { className: 'lead-info-icon' }, e(Icons.Tag, { width: 14, height: 14 })), e('span', { className: 'lead-info-label' }, 'Fuente'), e('span', { className: 'lead-info-value' }, lead.source)),
        lead.message && e('div', { className: 'lead-info-row' }, e('span', { className: 'lead-info-icon' }, e(Icons.Mail, { width: 14, height: 14 })), e('span', { className: 'lead-info-label' }, 'Mensaje'), e('span', { className: 'lead-info-value' }, lead.message)),

        e('div', null, e('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8, marginTop: 14 } }, 'Cambiar estado'),
          e('div', { className: 'lead-status-bar' },
            STATUS_OPTS.filter((s) => s.key !== 'all').map((s) =>
              e('button', {
                key: s.key, disabled: saving || lead.status === s.key,
                className: `btn xs${lead.status === s.key ? ' primary' : ' ghost'}`,
                onClick: () => handleStatusChange(s.key),
              }, s.label)
            ),
          ),
        ),

        e('div', { className: 'field', style: { marginTop: 14 } },
          e('label', null, 'Agente asignado'),
          e('select', {
            value: lead.assignedTo?._id || '',
            disabled: saving,
            onChange: (ev) => handleAssign(ev.target.value),
          },
            e('option', { value: '' }, 'Sin asignar'),
            users.map((u) => e('option', { key: u._id, value: u._id }, u.name)),
          ),
        ),

        e('div', { className: 'lead-notes-field' },
          e('label', null, 'Notas internas'),
          e('textarea', { value: notes, onChange: (ev) => setNotes(ev.target.value), placeholder: 'Añadí notas sobre este lead…' }),
          e('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 8 } },
            e('button', { className: 'btn ghost sm danger', onClick: handleDelete }, e(Icons.Trash, { width: 13, height: 13 }), 'Eliminar'),
            e('button', { className: 'btn primary sm', disabled: saving, onClick: handleSaveNotes }, saving ? 'Guardando…' : 'Guardar notas'),
          ),
        ),
      ),
    ),
  );
}

function NewLeadModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', source: 'manual', propertyId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.name || !form.email) { setError('Nombre y email son requeridos'); return; }
    setSaving(true);
    setError('');
    try {
      const lead = await createLead({ ...form, propertyId: form.propertyId ? parseInt(form.propertyId, 10) : undefined });
      onCreated(lead);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al crear lead');
    } finally {
      setSaving(false);
    }
  }

  return e('div', { className: 'lead-modal-overlay', onClick: onClose },
    e('form', { className: 'lead-modal', onClick: (ev) => ev.stopPropagation(), onSubmit: handleSubmit },
      e('div', { className: 'lead-modal-head' },
        e('h2', null, 'Nuevo lead'),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('div', { className: 'lead-modal-body' },
        e('div', { className: 'new-lead-form' },
          error && e('div', { style: { fontSize: 12, color: '#9c2e2a', background: '#fce9e8', padding: '8px 12px', borderRadius: 8 } }, error),
          e('div', { className: 'form-row' },
            e('div', { className: 'field' }, e('label', null, 'Nombre *'), e('input', { value: form.name, onChange: set('name'), placeholder: 'Juan Pérez', required: true })),
            e('div', { className: 'field' }, e('label', null, 'Email *'), e('input', { type: 'email', value: form.email, onChange: set('email'), placeholder: 'juan@email.com', required: true })),
          ),
          e('div', { className: 'form-row' },
            e('div', { className: 'field' }, e('label', null, 'Teléfono'), e('input', { value: form.phone, onChange: set('phone'), placeholder: '+54 9 11...' })),
            e('div', { className: 'field' }, e('label', null, 'ID Propiedad'), e('input', { type: 'number', value: form.propertyId, onChange: set('propertyId'), placeholder: 'Ej: 4260629' })),
          ),
          e('div', { className: 'field' },
            e('label', null, 'Fuente'),
            e('select', { value: form.source, onChange: set('source') }, SOURCE_OPTS.map((s) => e('option', { key: s, value: s }, s))),
          ),
          e('div', { className: 'field' }, e('label', null, 'Mensaje'), e('textarea', { value: form.message, onChange: set('message'), placeholder: 'Mensaje del lead…', style: { minHeight: 70 } })),
          e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 } },
            e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, 'Cancelar'),
            e('button', { type: 'submit', className: 'btn primary sm', disabled: saving }, saving ? 'Creando…' : 'Crear lead'),
          ),
        ),
      ),
    ),
  );
}

export default function Leads({ session }) {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = { limit: 100 };
    if (search) params.searchQuery = search;
    if (statusFilter !== 'all') params.status = statusFilter;
    try {
      const data = await getLeads(params);
      setLeads(data?.objects || []);
      setTotal(data?.meta?.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  function handleUpdated(updatedLead, deleted = false) {
    if (deleted) {
      setLeads((ls) => ls.filter((l) => l._id !== selected?._id));
    } else {
      setLeads((ls) => ls.map((l) => l._id === updatedLead._id ? updatedLead : l));
    }
  }

  return e('div', { className: 'leads' },
    e('div', { className: 'leads-toolbar' },
      e('div', { className: 'leads-toolbar-left' },
        e('h1', null, 'Leads'),
        e('span', { className: 'leads-count-pill' }, `${total} leads`),
      ),
      e('div', { style: { display: 'flex', gap: 8 } },
        e('div', { className: 'search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', {
            placeholder: 'Buscar por nombre, email…', value: search,
            onChange: (ev) => setSearch(ev.target.value),
            onKeyDown: (ev) => ev.key === 'Enter' && fetchLeads(),
            style: { width: 200 },
          }),
          search ? e('button', { className: 'search-clear', onClick: () => setSearch('') }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
        e('button', { className: 'btn primary sm', onClick: () => setShowNew(true) },
          e(Icons.Plus, { width: 14, height: 14 }), 'Nuevo lead',
        ),
      ),
    ),

    e('div', { className: 'lead-status-chips' },
      STATUS_OPTS.map((s) =>
        e('button', {
          key: s.key,
          className: `st-chip${statusFilter === s.key ? ` on ${s.key}` : ''}`,
          onClick: () => setStatusFilter(s.key),
        }, s.label),
      ),
    ),

    e('div', { className: 'leads-body' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando leads…')
        : leads.length === 0
          ? e('div', { className: 'lead-empty' }, e(Icons.Mail, { width: 44, height: 44 }), e('p', null, 'No hay leads todavía'))
          : e('div', { className: 'leads-list' },
              leads.map((lead) => {
                const color = colorOf(lead.email || lead.name);
                const ini = initials(lead.name);
                return e('div', { key: lead._id, className: 'lead-card', onClick: () => setSelected(lead) },
                  e('div', { className: 'lead-card-avatar', style: { background: color } }, ini.toUpperCase()),
                  e('div', { className: 'lead-card-info' },
                    e('div', { className: 'lead-card-name' }, lead.name),
                    e('div', { className: 'lead-card-email' }, lead.email),
                    e('div', { className: 'lead-card-meta' },
                      lead.propertyTitle && e('span', { className: 'lead-card-property' }, e(Icons.Building, { width: 10, height: 10 }), lead.propertyTitle.slice(0, 30)),
                      e('span', { className: 'lead-card-source' }, lead.source),
                    ),
                  ),
                  e('div', { className: 'lead-card-right' },
                    e('span', { className: `status-badge badge-${lead.status}` }, STATUS_LABELS[lead.status] || lead.status),
                    e('span', { className: 'lead-card-date' }, timeAgo(lead.createdAt)),
                  ),
                );
              }),
            ),
    ),

    selected && e(LeadModal, { lead: selected, onClose: () => setSelected(null), onUpdated: (l, del) => { handleUpdated(l, del); if (del) setSelected(null); } }),
    showNew && e(NewLeadModal, { onClose: () => setShowNew(false), onCreated: (lead) => { setLeads((ls) => [lead, ...ls]); setTotal((t) => t + 1); } }),
  );
}
