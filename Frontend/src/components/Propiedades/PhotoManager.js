'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { photoSrc } from '@/lib/data';
import { uploadPropertyPhotos, deletePropertyPhoto, reorderPropertyPhotos, updatePropertyPhotoDescription } from '@/services/api';
import './PhotoManager.css';

const e = React.createElement;
const { useState, useRef, useEffect } = React;

export default function PhotoManager({ property, onPropertyChange }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [descEditId, setDescEditId] = useState(null);
  const [descDraft, setDescDraft] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const fileInputRef = useRef(null);

  const photos = property.photos || [];

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKeyDown(ev) {
      if (ev.key === 'Escape') setLightboxIndex(null);
      else if (ev.key === 'ArrowRight') setLightboxIndex((i) => (i + 1) % photos.length);
      else if (ev.key === 'ArrowLeft') setLightboxIndex((i) => (i - 1 + photos.length) % photos.length);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex, photos.length]);

  async function handleFilesSelected(ev) {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    const failed = [];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      try {
        // eslint-disable-next-line no-await-in-loop
        const updated = await uploadPropertyPhotos(property.id, [files[i]]);
        onPropertyChange(updated);
      } catch (err) {
        failed.push(files[i].name);
      }
    }
    if (failed.length) setError(`No se pudieron subir: ${failed.join(', ')}`);
    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDelete(photoId) {
    if (!confirm('¿Eliminar esta foto? No se puede deshacer.')) return;
    setBusyId(photoId);
    setError('');
    try {
      const updated = await deletePropertyPhoto(property.id, photoId);
      onPropertyChange(updated);
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la foto.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReorder(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= photos.length || toIndex >= photos.length) return;
    const reordered = photos.slice();
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    onPropertyChange({ ...property, photos: reordered });
    setError('');
    try {
      const order = reordered.map((p) => p._id);
      const updated = await reorderPropertyPhotos(property.id, order);
      onPropertyChange(updated);
    } catch (err) {
      setError(err.message || 'No se pudo reordenar. Se revirtió el cambio.');
      onPropertyChange({ ...property, photos });
    }
  }

  async function handleSaveDescription(photoId) {
    setBusyId(photoId);
    setError('');
    try {
      const updated = await updatePropertyPhotoDescription(property.id, photoId, descDraft);
      onPropertyChange(updated);
      setDescEditId(null);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la descripción.');
    } finally {
      setBusyId(null);
    }
  }

  function openDescriptionEditor(photo) {
    setDescDraft(photo.description || '');
    setDescEditId(photo._id);
  }

  function handleDragStart(index) {
    return (ev) => {
      setDragIndex(index);
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', String(index)); } catch { /* Firefox needs this set even if unused */ }
    };
  }

  function handleDragOver(index) {
    return (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      if (index !== overIndex) setOverIndex(index);
    };
  }

  function handleDrop(index) {
    return (ev) => {
      ev.preventDefault();
      if (dragIndex !== null && dragIndex !== index) handleReorder(dragIndex, index);
      setDragIndex(null);
      setOverIndex(null);
    };
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return e('div', { className: 'photo-manager' },
    e('div', { className: 'photo-upload-bar' },
      e('input', {
        ref: fileInputRef, type: 'file', accept: 'image/*', multiple: true,
        onChange: handleFilesSelected, disabled: uploading, id: 'photo-upload-input',
        className: 'photo-upload-input',
      }),
      e('label', { htmlFor: 'photo-upload-input', className: `btn primary sm${uploading ? ' disabled' : ''}` },
        e(Icons.Upload, { width: 14, height: 14 }),
        uploading ? `Subiendo ${uploadProgress?.current || 1}/${uploadProgress?.total || 1}…` : 'Subir fotos',
      ),
      !uploading && e('span', { className: 'photo-upload-hint' }, `${photos.length} foto${photos.length === 1 ? '' : 's'} — la primera es la portada`),
      uploading && uploadProgress && e('div', { className: 'photo-upload-progress' },
        e('div', { className: 'photo-upload-progress-bar', style: { width: `${(uploadProgress.current / uploadProgress.total) * 100}%` } }),
      ),
    ),

    error && e('div', { className: 'photo-manager-error' }, error),

    photos.length === 0
      ? e('div', { className: 'photo-empty' }, 'Todavía no hay fotos. Subí la primera con el botón de arriba.')
      : e('div', { className: 'photo-grid' },
          photos.map((p, i) => {
            const src = photoSrc(p);
            const id = p._id;
            const busy = busyId === id;
            const editingDesc = descEditId === id;
            const cardClass = ['photo-card',
              dragIndex === i ? 'dragging' : '',
              overIndex === i && dragIndex !== null && dragIndex !== i ? 'drag-over' : '',
            ].filter(Boolean).join(' ');
            return e('div', {
              key: id || i, className: cardClass,
              draggable: !busy && !editingDesc, onDragStart: handleDragStart(i), onDragOver: handleDragOver(i),
              onDrop: handleDrop(i), onDragEnd: handleDragEnd,
              title: 'Arrastrá para reordenar',
            },
              e('div', { className: 'photo-card-img' },
                src ? e('img', { src, alt: `Foto ${i + 1}`, draggable: false }) : e('div', { className: 'photo-card-noimg' }, e(Icons.Image, { width: 22, height: 22 })),
                i === 0 && e('span', { className: 'photo-card-cover' }, 'Portada'),
                !p.original_url && e('span', { className: 'photo-card-manual' }, 'Subida manual'),
                src && e('button', {
                  type: 'button', className: 'photo-card-view', title: 'Ver en grande',
                  onClick: (ev) => { ev.stopPropagation(); setLightboxIndex(i); },
                }, e(Icons.Eye, { width: 18, height: 18 })),
              ),
              e('div', { className: 'photo-card-actions' },
                e('button', { className: `btn ghost xs${p.description ? ' has-desc' : ''}`, disabled: busy, onClick: () => openDescriptionEditor(p), title: p.description ? 'Editar descripción' : 'Agregar descripción' },
                  e(Icons.Edit, { width: 13, height: 13 })),
                e('button', { className: 'btn danger xs', disabled: busy, onClick: () => handleDelete(id), title: 'Eliminar' },
                  e(Icons.Trash, { width: 13, height: 13 })),
              ),
              editingDesc
                ? e('div', { className: 'photo-card-desc-editor' },
                    e('textarea', {
                      value: descDraft, onChange: (ev) => setDescDraft(ev.target.value),
                      placeholder: 'Descripción de la imagen…', rows: 2, disabled: busy, autoFocus: true,
                      onKeyDown: (ev) => { if (ev.key === 'Escape') setDescEditId(null); },
                    }),
                    e('div', { className: 'photo-card-desc-actions' },
                      e('button', { className: 'btn ghost xs', disabled: busy, onClick: () => setDescEditId(null) }, 'Cancelar'),
                      e('button', { className: 'btn primary xs', disabled: busy, onClick: () => handleSaveDescription(id) }, busy ? 'Guardando…' : 'Guardar'),
                    ),
                  )
                : p.description && e('div', { className: 'photo-card-desc-preview', onClick: () => openDescriptionEditor(p), title: 'Click para editar' }, p.description),
            );
          }),
        ),

    lightboxIndex !== null && photos[lightboxIndex] && e('div', {
      className: 'photo-lightbox', onClick: () => setLightboxIndex(null),
    },
      e('button', {
        type: 'button', className: 'photo-lightbox-close', title: 'Cerrar',
        onClick: (ev) => { ev.stopPropagation(); setLightboxIndex(null); },
      }, e(Icons.Close, { width: 20, height: 20 })),

      photos.length > 1 && e('button', {
        type: 'button', className: 'photo-lightbox-nav photo-lightbox-prev', title: 'Anterior',
        onClick: (ev) => { ev.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length); },
      }, e(Icons.ChevronLeft, { width: 24, height: 24 })),

      e('div', { className: 'photo-lightbox-content', onClick: (ev) => ev.stopPropagation() },
        e('img', { src: photoSrc(photos[lightboxIndex]), alt: `Foto ${lightboxIndex + 1}` }),
        photos[lightboxIndex].description && e('div', { className: 'photo-lightbox-desc' }, photos[lightboxIndex].description),
        e('div', { className: 'photo-lightbox-count' }, `${lightboxIndex + 1} / ${photos.length}`),
      ),

      photos.length > 1 && e('button', {
        type: 'button', className: 'photo-lightbox-nav photo-lightbox-next', title: 'Siguiente',
        onClick: (ev) => { ev.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % photos.length); },
      }, e(Icons.Chevron, { width: 24, height: 24 })),
    ),
  );
}
