'use client';
import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Icons from '../Icons/Icons';

const e = React.createElement;
const { useState, useRef, useEffect } = React;

function ToolbarButton({ active, onClick, label, title }) {
  return e('button', {
    type: 'button',
    className: `rich-text-toolbar-btn${active ? ' active' : ''}`,
    onMouseDown: (ev) => ev.preventDefault(),
    onClick,
    title,
  }, label);
}

export default function RichTextField({ value, onSave, placeholder = '—' }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);
  const savedTimer = useRef(null);
  const errorTimer = useRef(null);
  const lastSyncedValue = useRef(value || '');

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'rich-text-content' } },
  });

  useEffect(() => { if (editor) editor.setEditable(editing); }, [editing, editor]);

  useEffect(() => {
    if (!editor || editing) return;
    if ((value || '') !== lastSyncedValue.current) {
      editor.commands.setContent(value || '', false);
      lastSyncedValue.current = value || '';
    }
  }, [value, editing, editor]);

  useEffect(() => () => { clearTimeout(savedTimer.current); clearTimeout(errorTimer.current); }, []);

  async function commit() {
    if (!editor) return;
    const html = editor.isEmpty ? '' : editor.getHTML();
    if (html === (value || '')) { setEditing(false); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(html);
      lastSyncedValue.current = html;
      setEditing(false);
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      console.error(err);
      editor.commands.setContent(value || '', false);
      setError('No se pudo guardar. Probá de nuevo.');
      clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => setError(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  function handleWrapBlur(ev) {
    if (wrapRef.current && wrapRef.current.contains(ev.relatedTarget)) return;
    commit();
  }

  function handleKeyDown(ev) {
    if (ev.key === 'Escape') {
      editor?.commands.setContent(value || '', false);
      setEditing(false);
    }
  }

  function startEditing() {
    setEditing(true);
    setTimeout(() => editor?.commands.focus('end'), 0);
  }

  if (!editor) return null;

  if (editing) {
    return e('div', { ref: wrapRef, className: 'rich-text-field-wrap editing', onBlur: handleWrapBlur, onKeyDown: handleKeyDown },
      e('div', { className: 'rich-text-toolbar' },
        e(ToolbarButton, { label: e('b', null, 'B'), title: 'Negrita', active: editor.isActive('bold'), onClick: () => editor.chain().focus().toggleBold().run() }),
        e(ToolbarButton, { label: e('i', null, 'I'), title: 'Itálica', active: editor.isActive('italic'), onClick: () => editor.chain().focus().toggleItalic().run() }),
        e(ToolbarButton, { label: '•', title: 'Lista', active: editor.isActive('bulletList'), onClick: () => editor.chain().focus().toggleBulletList().run() }),
        e(ToolbarButton, { label: '1.', title: 'Lista numerada', active: editor.isActive('orderedList'), onClick: () => editor.chain().focus().toggleOrderedList().run() }),
        saving && e('span', { className: 'editable-field-saving' }, e('span', { className: 'editable-field-spinner' })),
      ),
      e(EditorContent, { editor }),
      e('span', { className: 'editable-field-hint' }, 'Click afuera para guardar · Esc para cancelar'),
      error && e('span', { className: 'editable-field-error' }, error),
    );
  }

  const isEmpty = !value || editor.isEmpty;
  return e('div', { className: 'rich-text-field-wrap' },
    e('div', {
      className: `rich-text-display${isEmpty ? ' empty' : ''}`,
      onClick: startEditing,
      title: 'Click para editar',
    },
      isEmpty ? e('span', null, placeholder) : e(EditorContent, { editor }),
      e(Icons.Edit, { width: 11, height: 11, className: 'editable-field-icon' }),
    ),
    saved && e('span', { className: 'editable-field-saved' }, e(Icons.Check, { width: 11, height: 11 }), 'Guardado'),
  );
}
