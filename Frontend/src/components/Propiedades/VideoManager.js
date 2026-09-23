'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { updateProperty } from '@/services/api';
import './VideoManager.css';

const e = React.createElement;
const { useState } = React;

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYoutubeId(url) {
  const match = String(url || '').match(YOUTUBE_ID_RE);
  return match ? match[1] : null;
}

export default function VideoManager({ property, onPropertyChange }) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const videos = property.videos || [];

  async function handleAdd(ev) {
    ev.preventDefault();
    const videoId = extractYoutubeId(url);
    if (!videoId) {
      setError('Pegá un link válido de YouTube (youtube.com/watch?v=... o youtu.be/...).');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const newVideo = {
        url: url.trim(),
        video_id: videoId,
        provider: 'youtube',
        player_url: `https://www.youtube.com/embed/${videoId}`,
        order: videos.length,
      };
      const updated = await updateProperty(property.id, { videos: [...videos, newVideo] });
      onPropertyChange(updated);
      setUrl('');
    } catch (err) {
      setError(err.message || 'No se pudo agregar el video.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(videoId) {
    if (!confirm('¿Eliminar este video?')) return;
    setBusyId(videoId);
    setError('');
    try {
      const updated = await updateProperty(property.id, { videos: videos.filter((v) => v._id !== videoId) });
      onPropertyChange(updated);
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el video.');
    } finally {
      setBusyId(null);
    }
  }

  return e('div', { className: 'video-manager' },
    e('form', { className: 'video-add-bar', onSubmit: handleAdd },
      e('input', {
        type: 'text', className: 'video-add-input', placeholder: 'Pegá el link de YouTube (https://youtube.com/watch?v=...)',
        value: url, onChange: (ev) => setUrl(ev.target.value), disabled: saving,
      }),
      e('button', { type: 'submit', className: `btn primary sm${saving ? ' disabled' : ''}`, disabled: saving },
        e(Icons.Video, { width: 14, height: 14 }),
        saving ? 'Agregando…' : 'Agregar video',
      ),
    ),

    error && e('div', { className: 'video-manager-error' }, error),

    videos.length === 0
      ? e('div', { className: 'video-empty' }, 'Todavía no hay videos. Pegá un link de YouTube arriba para agregar el primero.')
      : e('div', { className: 'video-grid' },
          videos.map((v, i) => e('div', { key: v._id || i, className: 'video-card' },
            e('div', { className: 'video-card-frame' },
              e('iframe', {
                src: v.player_url || `https://www.youtube.com/embed/${v.video_id}`,
                title: v.title || `Video ${i + 1}`, frameBorder: '0', allowFullScreen: true,
                allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
              }),
            ),
            e('div', { className: 'video-card-actions' },
              e('a', { className: 'btn ghost xs', href: v.url, target: '_blank', rel: 'noreferrer', title: 'Abrir en YouTube' },
                e(Icons.Eye, { width: 13, height: 13 })),
              e('button', {
                className: 'btn danger xs', disabled: busyId === v._id, onClick: () => handleDelete(v._id), title: 'Eliminar',
              }, e(Icons.Trash, { width: 13, height: 13 })),
            ),
          )),
        ),
  );
}
