'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import EditableField from '../UI/EditableField';
import {
  getFileRecords, getFileRecordById, createFileRecord, updateFileRecord,
  deleteFileRecord, uploadFiles, deleteFile,
} from '@/services/api';
import { API_BASE } from '@/lib/data';
import './Archivos.css';

const e = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

const STATUS_OPTS = [
  { key: 'all', label: 'Todos' },
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'en_revision', label: 'En revisión' },
  { key: 'lista', label: 'Lista' },
];
const STATUS_LABELS = { pendiente: 'Pendiente', en_revision: 'En revisión', lista: 'Lista' };
const FILE_TYPES = [
  { key: 'foto', label: 'Fotos', icon: Icons.Image },
  { key: 'video', label: 'Videos', icon: Icons.Video },
  { key: 'documento', label: 'Documentos', icon: Icons.FileText },
];

function fileCounts(files) {
  const counts = { foto: 0, video: 0, documento: 0 };
  (files || []).forEach((f) => { if (counts[f.type] !== undefined) counts[f.type] += 1; });
  return counts;
}

function NewRecordModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.title) { setError('El título es requerido'); return; }
    setSaving(true);
    setError('');
    try {
      const record = await createFileRecord(form);
      onCreated(record);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al crear el registro');
    } finally {
      setSaving(false);
    }
  }

  return e('div', { className: 'prop-modal-overlay', onClick: onClose },
    e('form', { className: 'prop-modal', style: { maxWidth: 480 }, onClick: (ev) => ev.stopPropagation(), onSubmit: handleSubmit },
      e('div', { className: 'prop-modal-head' },
        e('h2', null, 'Nueva propiedad'),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('div', { className: 'prop-modal-body' },
        error && e('div', { style: { fontSize: 12, color: '#9c2e2a', background: '#fce9e8', padding: '8px 12px', borderRadius: 8, marginBottom: 12 } }, error),
        e('div', { className: 'field', style: { marginBottom: 12 } }, e('label', null, 'Título *'), e('input', { value: form.title, onChange: set('title'), placeholder: 'Ej: Casa Alba e/ Guerr y He', required: true })),
        e('div', { className: 'field', style: { marginBottom: 12 } }, e('label', null, 'Dirección'), e('input', { value: form.address, onChange: set('address'), placeholder: 'Dirección de referencia' })),
        e('div', { className: 'field' }, e('label', null, 'Notas'), e('textarea', { value: form.notes, onChange: set('notes'), placeholder: 'Notas…', style: { minHeight: 70 } })),
        e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 } },
          e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, 'Cancelar'),
          e('button', { type: 'submit', className: 'btn primary sm', disabled: saving }, saving ? 'Creando…' : 'Crear'),
        ),
      ),
    ),
  );
}

function FileTypeSection({ recordId, type, label, Icon, files, onChanged }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const items = (files || []).filter((f) => f.type === type);

  async function handleFiles(ev) {
    const fileList = ev.target.files;
    if (!fileList || !fileList.length) return;
    setUploading(true);
    try {
      const updated = await uploadFiles(recordId, type, fileList);
      onChanged(updated);
    } catch (err) { console.error(err); }
    finally { setUploading(false); ev.target.value = ''; }
  }

  async function handleDelete(fileId) {
    try {
      const updated = await deleteFile(recordId, fileId);
      onChanged(updated);
    } catch (err) { console.error(err); }
  }

  return e('div', { className: 'file-type-section' },
    e('div', { className: 'file-type-head' },
      e('span', null, e(Icon, { width: 14, height: 14 }), label, e('span', { className: 'file-type-count' }, items.length)),
      e('button', { type: 'button', className: 'btn ghost xs', disabled: uploading, onClick: () => inputRef.current?.click() },
        e(Icons.Upload, { width: 12, height: 12 }), uploading ? 'Subiendo…' : 'Subir'),
      e('input', { ref: inputRef, type: 'file', multiple: true, style: { display: 'none' }, onChange: handleFiles, accept: type === 'foto' ? 'image/*' : type === 'video' ? 'video/*' : undefined }),
    ),
    items.length === 0
      ? e('div', { className: 'file-type-empty' }, 'Sin archivos')
      : e('div', { className: 'file-type-grid' },
          items.map((f) =>
            e('div', { key: f._id, className: 'file-item' },
              type === 'foto'
                ? e('img', { src: `${API_BASE}${f.url}`, alt: f.filename })
                : e('div', { className: 'file-item-generic' }, e(Icon, { width: 20, height: 20 }), e('span', null, f.filename)),
              e('button', { type: 'button', className: 'file-item-delete', onClick: () => handleDelete(f._id) }, e(Icons.Close, { width: 11, height: 11 })),
            ),
          ),
        ),
  );
}

function RecordModal({ recordId, onClose, onSaved }) {
  const [record, setRecord] = useState(null);

  useEffect(() => { getFileRecordById(recordId).then(setRecord).catch(console.error); }, [recordId]);

  async function saveField(key, value) {
    const updated = await updateFileRecord(recordId, { [key]: value });
    setRecord(updated);
    onSaved(updated);
  }

  function handleFilesChanged(updated) {
    setRecord(updated);
    onSaved(updated);
  }

  async function handleDeleteRecord() {
    if (!confirm(`¿Eliminar "${record.title}" y todos sus archivos?`)) return;
    await deleteFileRecord(recordId).catch(console.error);
    onSaved(null, true);
    onClose();
  }

  if (!record) return null;

  return e('div', { className: 'prop-modal-overlay', onClick: onClose },
    e('div', { className: 'prop-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'prop-modal-head' },
        e('h2', null, record.title),
        e('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          e('span', { className: `status-badge badge-${record.status}` }, STATUS_LABELS[record.status]),
          e('button', { className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
        ),
      ),
      e('div', { className: 'prop-modal-body' },
        e('div', { className: 'prop-info-grid' },
          e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Título'), e('div', { className: 'prop-info-value' }, e(EditableField, { value: record.title, onSave: (v) => saveField('title', v) }))),
          e('div', { className: 'prop-info-item' }, e('div', { className: 'prop-info-label' }, 'Dirección'), e('div', { className: 'prop-info-value' }, e(EditableField, { value: record.address, onSave: (v) => saveField('address', v) }))),
        ),
        e('div', { style: { marginBottom: 20 } },
          e('div', { className: 'prop-info-label', style: { marginBottom: 6 } }, 'Notas'),
          e(EditableField, { value: record.notes, onSave: (v) => saveField('notes', v), multiline: true, placeholder: 'Sin notas — click para agregar' }),
        ),

        e('div', { className: 'prop-status-section' },
          e('label', null, 'Estado'),
          e('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            STATUS_OPTS.filter((s) => s.key !== 'all').map((s) =>
              e('button', {
                key: s.key,
                className: `btn xs${record.status === s.key ? ' primary' : ' ghost'}`,
                onClick: () => saveField('status', s.key),
                disabled: record.status === s.key,
              }, s.label),
            ),
          ),
        ),

        FILE_TYPES.map((t) => e(FileTypeSection, { key: t.key, recordId, type: t.key, label: t.label, Icon: t.icon, files: record.files, onChanged: handleFilesChanged })),

        e('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 20 } },
          e('button', { className: 'btn ghost sm danger', onClick: handleDeleteRecord }, e(Icons.Trash, { width: 13, height: 13 }), 'Eliminar'),
        ),
      ),
    ),
  );
}

function RecordCard({ record, onClick }) {
  const counts = fileCounts(record.files);
  return e('div', { className: 'prop-card', onClick: () => onClick(record) },
    e('div', { className: 'file-card-body' },
      e('div', { className: 'file-card-top' },
        e('div', { className: 'prop-card-title' }, record.title),
        e('span', { className: `status-badge badge-${record.status}` }, STATUS_LABELS[record.status]),
      ),
      record.address && e('div', { className: 'prop-card-location' }, e(Icons.MapPin, { width: 11, height: 11 }), record.address),
      e('div', { className: 'file-card-counts' },
        e('span', null, e(Icons.Image, { width: 12, height: 12 }), counts.foto),
        e('span', null, e(Icons.Video, { width: 12, height: 12 }), counts.video),
        e('span', null, e(Icons.FileText, { width: 12, height: 12 }), counts.documento),
      ),
    ),
  );
}

export default function Archivos({ session }) {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = { limit: 100 };
    if (search) params.searchQuery = search;
    if (statusFilter !== 'all') params.status = statusFilter;
    try {
      const data = await getFileRecords(params);
      setRecords(data?.objects || []);
      setTotal(data?.meta?.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function handleSaved(updated, deleted = false) {
    if (deleted) {
      setRecords((rs) => rs.filter((r) => r._id !== selectedId));
      setTotal((t) => Math.max(0, t - 1));
    } else if (updated) {
      setRecords((rs) => rs.map((r) => r._id === updated._id ? updated : r));
    }
  }

  return e('div', { className: 'propiedades' },
    e('div', { className: 'prop-toolbar' },
      e('div', { className: 'prop-toolbar-left' },
        e('h1', null, 'Archivos'),
        e('span', { className: 'prop-count-pill' }, `${total} carpetas`),
      ),
      e('div', { style: { display: 'flex', gap: 8 } },
        e('div', { className: 'search' },
          e(Icons.Search, { width: 15, height: 15 }),
          e('input', {
            placeholder: 'Buscar por título, dirección…', value: search,
            onChange: (ev) => setSearch(ev.target.value),
            onKeyDown: (ev) => ev.key === 'Enter' && fetchRecords(),
            style: { width: 220 },
          }),
          search ? e('button', { className: 'search-clear', onClick: () => setSearch('') }, e(Icons.Close, { width: 13, height: 13 })) : null,
        ),
        e('button', { className: 'btn primary sm', onClick: () => setShowNew(true) }, e(Icons.Plus, { width: 14, height: 14 }), 'Nueva propiedad'),
      ),
    ),

    e('div', { className: 'status-chips' },
      STATUS_OPTS.map((s) =>
        e('button', {
          key: s.key,
          className: `st-chip${statusFilter === s.key ? ` on ${s.key}` : ''}`,
          onClick: () => setStatusFilter(s.key),
        }, s.label),
      ),
    ),

    e('div', { className: 'prop-list-wrap' },
      loading
        ? e('div', { className: 'loading-state' }, 'Cargando…')
        : records.length === 0
          ? e('div', { className: 'prop-empty' }, e(Icons.Folder, { width: 48, height: 48 }), e('p', null, 'No hay propiedades cargadas todavía'))
          : e('div', { className: 'prop-grid' }, records.map((r) => e(RecordCard, { key: r._id, record: r, onClick: (rec) => setSelectedId(rec._id) }))),
    ),

    selectedId && e(RecordModal, { recordId: selectedId, onClose: () => setSelectedId(null), onSaved: handleSaved }),
    showNew && e(NewRecordModal, { onClose: () => setShowNew(false), onCreated: (rec) => { setRecords((rs) => [rec, ...rs]); setTotal((t) => t + 1); } }),
  );
}
