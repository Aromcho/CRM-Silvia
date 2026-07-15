'use client';
import React from 'react';
import Icons from '../Icons/Icons';

const e = React.createElement;
const { useState, useRef, useEffect } = React;

export default function EditableField({ value, onSave, type = 'text', placeholder = '—', multiline = false, formatDisplay }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const savedTimer = useRef(null);
  const errorTimer = useRef(null);

  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if (ref.current.select) ref.current.select();
    }
  }, [editing]);
  useEffect(() => () => { clearTimeout(savedTimer.current); clearTimeout(errorTimer.current); }, []);

  async function commit() {
    if (String(draft) === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(type === 'number' ? (draft === '' ? null : Number(draft)) : draft);
      setEditing(false);
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      console.error(err);
      setDraft(value ?? '');
      setError('No se pudo guardar. Probá de nuevo.');
      clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => setError(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value ?? '');
    setEditing(false);
  }

  function handleKeyDown(ev) {
    if (ev.key === 'Enter' && !multiline) { ev.preventDefault(); commit(); }
    else if (ev.key === 'Escape') { cancel(); }
  }

  if (editing) {
    return e('span', { className: 'editable-field-wrap editing' },
      e(multiline ? 'textarea' : 'input', {
        ref,
        type: multiline ? undefined : type,
        value: draft,
        onChange: (ev) => setDraft(ev.target.value),
        onBlur: commit,
        onKeyDown: handleKeyDown,
        disabled: saving,
        className: 'editable-field-input',
        rows: multiline ? 4 : undefined,
      }),
      saving && e('span', { className: 'editable-field-saving' }, e('span', { className: 'editable-field-spinner' })),
      !multiline && e('span', { className: 'editable-field-hint' }, 'Enter para guardar · Esc para cancelar'),
    );
  }

  const isEmpty = value === undefined || value === null || value === '';
  const display = formatDisplay ? formatDisplay(value) : (isEmpty ? placeholder : value);

  return e('span', { className: 'editable-field-wrap' },
    e('span', {
      className: `editable-field-display${isEmpty ? ' empty' : ''}`,
      onClick: () => setEditing(true),
      title: 'Click para editar',
    },
      e('span', null, display),
      e(Icons.Edit, { width: 11, height: 11, className: 'editable-field-icon' }),
    ),
    saved && e('span', { className: 'editable-field-saved' }, e(Icons.Check, { width: 11, height: 11 }), 'Guardado'),
    error && e('span', { className: 'editable-field-error' }, error),
  );
}
