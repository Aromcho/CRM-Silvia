'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { photoSrc } from '@/lib/data';
import { uploadPropertyPhotos, deletePropertyPhoto, reorderPropertyPhotos } from '@/services/api';
import './PhotoManager.css';

const e = React.createElement;
const { useState, useRef } = React;

export default function PhotoManager({ property, onPropertyChange }) {
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const photos = property.photos || [];

  async function handleFilesSelected(ev) {
    const files = ev.target.files;
    if (!files || !files.length) return;
    setUploading(true);
    setError('');
    try {
      const updated = await uploadPropertyPhotos(property.id, files);
      onPropertyChange(updated);
    } catch (err) {
      setError(err.message || 'No se pudieron subir las fotos.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  async function handleMove(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= photos.length) return;
    const reordered = photos.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
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

  return e('div', { className: 'photo-manager' },
    e('div', { className: 'photo-upload-bar' },
      e('input', {
        ref: fileInputRef, type: 'file', accept: 'image/*', multiple: true,
        onChange: handleFilesSelected, disabled: uploading, id: 'photo-upload-input',
        className: 'photo-upload-input',
      }),
      e('label', { htmlFor: 'photo-upload-input', className: `btn primary sm${uploading ? ' disabled' : ''}` },
        e(Icons.Upload, { width: 14, height: 14 }),
        uploading ? 'Subiendo…' : 'Subir fotos',
      ),
      e('span', { className: 'photo-upload-hint' }, `${photos.length} foto${photos.length === 1 ? '' : 's'} — la primera es la portada`),
    ),

    error && e('div', { className: 'photo-manager-error' }, error),

    photos.length === 0
      ? e('div', { className: 'photo-empty' }, 'Todavía no hay fotos. Subí la primera con el botón de arriba.')
      : e('div', { className: 'photo-grid' },
          photos.map((p, i) => {
            const src = photoSrc(p);
            const id = p._id;
            const busy = busyId === id;
            return e('div', { key: id || i, className: 'photo-card' },
              e('div', { className: 'photo-card-img' },
                src ? e('img', { src, alt: `Foto ${i + 1}` }) : e('div', { className: 'photo-card-noimg' }, e(Icons.Image, { width: 22, height: 22 })),
                i === 0 && e('span', { className: 'photo-card-cover' }, 'Portada'),
                !p.original_url && e('span', { className: 'photo-card-manual' }, 'Subida manual'),
              ),
              e('div', { className: 'photo-card-actions' },
                e('button', { className: 'btn ghost xs', disabled: i === 0 || busy, onClick: () => handleMove(i, -1), title: 'Mover antes' },
                  e(Icons.ChevronLeft, { width: 13, height: 13 })),
                e('button', { className: 'btn ghost xs', disabled: i === photos.length - 1 || busy, onClick: () => handleMove(i, 1), title: 'Mover después' },
                  e(Icons.Chevron, { width: 13, height: 13 })),
                e('button', { className: 'btn danger xs', disabled: busy, onClick: () => handleDelete(id), title: 'Eliminar' },
                  e(Icons.Trash, { width: 13, height: 13 })),
              ),
            );
          }),
        ),
  );
}
