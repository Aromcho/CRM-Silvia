'use client';
import React from 'react';
import { useEditor, EditorContent, Node, mergeAttributes } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Icons from '../Icons/Icons';
import { searchMailProperties } from '@/services/api';

const e = React.createElement;
const { useState, useEffect, useRef } = React;

// Bloque "propiedad": en el HTML guardado queda como <div data-property-block data-property-id="…">
// y el backend lo reemplaza al enviar por una tarjeta en tablas con los datos actuales (foto,
// precio, zona, link a la ficha). title/zone/price/image son solo para dibujarlo en el editor.
const dataAttr = (name) => ({
  default: '',
  parseHTML: (el) => el.getAttribute(`data-${name}`) || '',
  renderHTML: (attrs) => (attrs[name] ? { [`data-${name}`]: attrs[name] } : {}),
});

const PropertyBlock = Node.create({
  name: 'propertyBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-property-id'), renderHTML: (a) => ({ 'data-property-id': a.id }) },
      title: dataAttr('title'),
      zone: dataAttr('zone'),
      price: dataAttr('price'),
      image: dataAttr('image'),
    };
  },
  parseHTML() { return [{ tag: 'div[data-property-block]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-property-block': '' }, HTMLAttributes)]; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'mm-prop-block';
      dom.contentEditable = 'false';
      const { image, title, zone, price, id } = node.attrs;
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        dom.appendChild(img);
      }
      const body = document.createElement('div');
      body.className = 'mm-prop-block-body';
      [['strong', title || `Propiedad #${id}`], ['span', zone], ['em', price]].forEach(([tag, text]) => {
        if (!text) return;
        const el = document.createElement(tag);
        el.textContent = text;
        body.appendChild(el);
      });
      const btn = document.createElement('span');
      btn.className = 'mm-prop-block-btn';
      btn.textContent = 'Ver propiedad';
      body.appendChild(btn);
      dom.appendChild(body);
      return { dom };
    };
  },
});

function ToolbarButton({ active, onClick, label, title, disabled }) {
  return e('button', {
    type: 'button',
    className: `rich-text-toolbar-btn${active ? ' active' : ''}`,
    onMouseDown: (ev) => ev.preventDefault(),
    onClick,
    title,
    disabled,
  }, label);
}

function PropertyPickerModal({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      searchMailProperties(q).then((r) => setResults(r || [])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return e('div', { className: 'lead-modal-overlay', onClick: onClose },
    e('div', { className: 'lead-modal mm-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'lead-modal-head' },
        e('h2', null, 'Insertar propiedad'),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose, 'aria-label': 'Cerrar' }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('div', { className: 'mm-modal-body' },
        e('div', { className: 'search' }, e(Icons.Search, { width: 15, height: 15 }),
          e('input', { autoFocus: true, value: q, onChange: (ev) => setQ(ev.target.value), placeholder: 'Buscar por ID, título, dirección o zona' })),
        !results ? e('p', { className: 'mm-muted' }, 'Buscando…')
          : !results.length ? e('p', { className: 'mm-muted' }, 'Sin resultados')
            : e('div', { className: 'mm-pick-list' }, results.map((p) => e('button', { key: p.id, type: 'button', className: 'mm-pick', onClick: () => onPick(p) },
              p.image ? e('img', { src: p.image, alt: '', loading: 'lazy' }) : e('span', { className: 'mm-pick-noimg' }, e(Icons.Building, { width: 16, height: 16 })),
              e('span', { className: 'mm-pick-body' },
                e('strong', null, p.title),
                e('span', null, [`#${p.id}`, p.zone, p.price].filter(Boolean).join(' · ')),
                p.status && p.status !== 'disponible' && e('span', { className: 'mm-warn' }, p.status.replace('_', ' ')),
              ),
            ))),
      ),
    ),
  );
}

// value: HTML. mode: 'visual' | 'html'. En modo HTML el textarea es la fuente de verdad y el
// editor visual no lo toca (TipTap simplifica tablas y estilos que no conoce).
export default function MailEditor({ value, mode, onChange, onModeChange, variables, readOnly }) {
  const [picker, setPicker] = useState(false);
  const [varsOpen, setVarsOpen] = useState(false);
  const lastEmitted = useRef(value || '');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } } }),
      Image.configure({ inline: false, allowBase64: false }),
      PropertyBlock,
    ],
    content: mode === 'visual' ? (value || '') : '',
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true, // para que los botones de la barra reflejen el formato del cursor
    editorProps: { attributes: { class: 'rich-text-content mm-editor-content' } },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });

  useEffect(() => { if (editor) editor.setEditable(!readOnly); }, [editor, readOnly]);

  // Cambio de contenido desde afuera (duplicar, recargar): se vuelca al editor
  useEffect(() => {
    if (!editor || mode !== 'visual') return;
    if ((value || '') !== lastEmitted.current) {
      editor.commands.setContent(value || '', { emitUpdate: false });
      lastEmitted.current = value || '';
    }
  }, [value, mode, editor]);

  function switchMode(next) {
    if (next === mode) return;
    if (next === 'visual') {
      if (/<table|style=/i.test(value || '') && !window.confirm('El editor visual puede simplificar el HTML (tablas y estilos propios se pierden). ¿Pasar igual?')) return;
      editor?.commands.setContent(value || '', { emitUpdate: false });
      lastEmitted.current = value || '';
    }
    onModeChange(next);
  }

  function setLink() {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL del link (vacío para quitarlo)', prev || 'https://');
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  function addImage() {
    const url = window.prompt('URL pública de la imagen (https://…)', 'https://');
    if (!url || url.trim() === 'https://') return;
    if (!/^https:\/\//i.test(url.trim())) { window.alert('La imagen tiene que ser una URL https:// pública (los clientes de mail no muestran imágenes locales).'); return; }
    editor.chain().focus().setImage({ src: url.trim() }).run();
  }

  function insertProperty(p) {
    setPicker(false);
    const attrs = { id: String(p.id), title: p.title, zone: p.zone, price: p.price, image: p.image };
    if (mode === 'html') {
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      onChange(`${value || ''}\n<div data-property-block="" data-property-id="${attrs.id}" data-title="${esc(attrs.title)}"></div>\n`);
      return;
    }
    editor.chain().focus().insertContent({ type: 'propertyBlock', attrs }).run();
  }

  function insertVariable(key) {
    setVarsOpen(false);
    const token = `{{${key}}}`;
    if (mode === 'html') { onChange(`${value || ''}${token}`); return; }
    editor.chain().focus().insertContent(token).run();
  }

  const ed = editor;
  const visual = mode === 'visual';
  const tb = (label, title, active, onClick) => e(ToolbarButton, { key: title, label, title, active, onClick, disabled: readOnly || !visual || !ed });

  return e('div', { className: `mm-editor${readOnly ? ' readonly' : ''}` },
    e('div', { className: 'rich-text-toolbar mm-toolbar' },
      ed && visual && e(React.Fragment, null,
        tb(e('strong', null, 'B'), 'Negrita', ed.isActive('bold'), () => ed.chain().focus().toggleBold().run()),
        tb(e('em', null, 'I'), 'Itálica', ed.isActive('italic'), () => ed.chain().focus().toggleItalic().run()),
        tb(e('u', null, 'U'), 'Subrayado', ed.isActive('underline'), () => ed.chain().focus().toggleUnderline().run()),
        e('span', { className: 'mm-tb-sep' }),
        tb('T1', 'Título', ed.isActive('heading', { level: 2 }), () => ed.chain().focus().toggleHeading({ level: 2 }).run()),
        tb('T2', 'Subtítulo', ed.isActive('heading', { level: 3 }), () => ed.chain().focus().toggleHeading({ level: 3 }).run()),
        tb('•', 'Lista', ed.isActive('bulletList'), () => ed.chain().focus().toggleBulletList().run()),
        tb('1.', 'Lista numerada', ed.isActive('orderedList'), () => ed.chain().focus().toggleOrderedList().run()),
        tb('❝', 'Cita', ed.isActive('blockquote'), () => ed.chain().focus().toggleBlockquote().run()),
        tb('―', 'Línea divisoria', false, () => ed.chain().focus().setHorizontalRule().run()),
        e('span', { className: 'mm-tb-sep' }),
        tb(e(Icons.ExternalLink, { width: 13, height: 13 }), 'Link', ed.isActive('link'), setLink),
        tb(e(Icons.Image, { width: 14, height: 14 }), 'Imagen por URL', false, addImage),
        e('span', { className: 'mm-tb-sep' }),
        tb('↶', 'Deshacer', false, () => ed.chain().focus().undo().run()),
        tb('↷', 'Rehacer', false, () => ed.chain().focus().redo().run()),
      ),
      !visual && e('span', { className: 'mm-muted mm-small' }, 'Editando HTML a mano'),
      e('span', { className: 'mm-tb-grow' }),
      !readOnly && e('button', { type: 'button', className: 'btn ghost xs', onClick: () => setPicker(true) }, e(Icons.Building, { width: 12, height: 12 }), 'Insertar propiedad'),
      !readOnly && e('div', { className: 'mm-vars' },
        e('button', { type: 'button', className: 'btn ghost xs', onClick: () => setVarsOpen((v) => !v) }, '{{ }} Variable'),
        varsOpen && e('div', { className: 'mm-vars-pop' }, (variables || []).map((v) => e('button', { key: v.key, type: 'button', onClick: () => insertVariable(v.key), title: v.hint },
          e('code', null, `{{${v.key}}}`), e('span', null, v.hint)))),
      ),
      e('div', { className: 'mm-mode' },
        ['visual', 'html'].map((m) => e('button', { key: m, type: 'button', className: mode === m ? 'active' : '', onClick: () => switchMode(m), disabled: readOnly }, m === 'visual' ? 'Visual' : 'HTML'))),
    ),
    visual
      ? e(EditorContent, { editor })
      : e('textarea', { className: 'mm-html-input', value: value || '', onChange: (ev) => onChange(ev.target.value), spellCheck: false, readOnly, placeholder: '<p>Hola {{nombre}},</p>' }),
    picker && e(PropertyPickerModal, { onPick: insertProperty, onClose: () => setPicker(false) }),
  );
}
