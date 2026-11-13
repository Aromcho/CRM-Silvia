'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { addPropertyVideoLink, deletePropertyVideo, uploadPropertyVideo } from '@/services/api';
import './VideoManager.css';

const e = React.createElement;
const { useState, useRef } = React;

// Videos de la propiedad, de cualquier fuente: link de YouTube, reel de Instagram o MP4 del celular.
// Se cargan una vez acá y aparecen en la ficha de la web, en la videoteca (/videos) y en el link
// corto /v/ID para mandar por WhatsApp. YouTube además viaja a MercadoLibre y ZonaProp.

const WEB = 'https://www.silviafernandezpropiedades.com.ar';
const MAX_MB = 300;

function kindOf(v) {
  if (v.provider === 'instagram' || /instagram\.com/.test(v.url || '')) return 'instagram';
  if (v.provider === 'mp4' || /\.(mp4|m4v|webm|mov)(\?|$)/i.test(v.url || '')) return 'mp4';
  return 'youtube';
}

const KIND_LABEL = { youtube: 'YouTube', instagram: 'Reel de Instagram', mp4: 'Video subido' };

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); } catch { return ''; }
}

function VideoPlayer({ video, index }) {
  const kind = kindOf(video);
  if (kind === 'mp4') {
    return e('div', { className: 'video-card-frame is-file' },
      e('video', { src: video.url, controls: true, preload: 'metadata', playsInline: true }));
  }
  if (kind === 'instagram') {
    const embed = video.player_url || `${String(video.url || '').replace(/\/?$/, '/')}embed`;
    return e('div', { className: 'video-card-frame is-reel' },
      e('iframe', { src: embed, title: video.title || `Reel ${index + 1}`, frameBorder: '0', scrolling: 'no', allowFullScreen: true, loading: 'lazy' }));
  }
  return e('div', { className: 'video-card-frame' },
    e('iframe', {
      src: video.player_url || `https://www.youtube.com/embed/${video.video_id}`,
      title: video.title || `Video ${index + 1}`, frameBorder: '0', allowFullScreen: true, loading: 'lazy',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    }));
}

export default function VideoManager({ property, onPropertyChange }) {
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const videos = property.videos || [];
  const shortLink = `${WEB}/v/${property.id}`;
  const busy = saving || progress !== null;

  async function handleAdd(ev) {
    ev.preventDefault();
    const value = url.trim();
    if (!value) return;
    if (!/youtu\.?be|instagram\.com|\.(mp4|m4v|webm|mov)(\?|$)/i.test(value)) {
      setError('Pegá un link de YouTube, de un reel de Instagram o de un archivo .mp4.');
      return;
    }
    setError(''); setNotice('');
    setSaving(true);
    try {
      const updated = await addPropertyVideoLink(property.id, value);
      if (updated) onPropertyChange(updated);
      setUrl('');
      setNotice(/instagram/i.test(value) ? 'Reel agregado: ya se ve en la web y en la videoteca.' : 'Video agregado.');
    } catch (err) {
      setError(err.message || 'No se pudo agregar el video.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!/\.(mp4|m4v|webm|mov)$/i.test(file.name)) {
      setError('El archivo tiene que ser un video MP4, MOV o WEBM.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El video pesa ${Math.round(file.size / 1024 / 1024)} MB y el máximo es ${MAX_MB} MB. Subilo a YouTube y pegá el link.`);
      return;
    }
    setError(''); setNotice('');
    setProgress(0);
    try {
      const updated = await uploadPropertyVideo(property.id, file, setProgress);
      if (updated) onPropertyChange(updated);
      setNotice('Video subido: ya se ve en la web y en la videoteca.');
    } catch (err) {
      setError(err.message || 'No se pudo subir el video.');
    } finally {
      setProgress(null);
    }
  }

  async function handleDelete(video) {
    if (!confirm('¿Quitar este video de la propiedad? Deja de verse en la web y en los portales.')) return;
    setBusyId(video._id);
    setError(''); setNotice('');
    try {
      const updated = await deletePropertyVideo(property.id, video._id);
      if (updated) onPropertyChange(updated);
    } catch (err) {
      setError(err.message || 'No se pudo quitar el video.');
    } finally {
      setBusyId(null);
    }
  }

  async function copyShortLink() {
    try { await navigator.clipboard.writeText(shortLink); } catch { /* sin portapapeles */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const waText = `Te paso el video de ${property.publication_title || 'la propiedad'} 🎥\n${shortLink}`;

  return e('div', { className: 'video-manager' },
    e('div', { className: 'video-add' },
      e('form', { className: 'video-add-bar', onSubmit: handleAdd },
        e('input', {
          type: 'text', className: 'video-add-input',
          placeholder: 'Pegá un link de YouTube o de un reel de Instagram',
          value: url, onChange: (ev) => setUrl(ev.target.value), disabled: busy,
        }),
        e('button', { type: 'submit', className: 'btn primary sm', disabled: busy || !url.trim() },
          e(Icons.Plus, { width: 14, height: 14 }),
          saving ? 'Agregando…' : 'Agregar link',
        ),
        e('span', { className: 'video-add-or' }, 'o'),
        e('button', { type: 'button', className: 'btn ghost sm', disabled: busy, onClick: () => fileRef.current?.click() },
          e(Icons.Upload, { width: 14, height: 14 }),
          'Subir video del celular',
        ),
        e('input', { ref: fileRef, type: 'file', accept: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm', hidden: true, onChange: handleFile }),
      ),
      e('p', { className: 'video-add-hint' },
        `MP4 o MOV hasta ${MAX_MB} MB. Los de YouTube también se mandan a MercadoLibre y ZonaProp; los reels y los subidos se ven en la web y en la videoteca.`),
      progress !== null && e('div', { className: 'video-progress', role: 'progressbar', 'aria-valuenow': progress, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        e('div', { className: 'video-progress-bar', style: { width: `${progress}%` } }),
        e('span', null, progress < 100 ? `Subiendo… ${progress}%` : 'Procesando…'),
      ),
    ),

    error && e('div', { className: 'video-manager-error' }, error),
    notice && e('div', { className: 'video-manager-notice' }, notice),

    videos.length > 0 && e('div', { className: 'video-share' },
      e('div', { className: 'video-share-text' },
        e('strong', null, 'Link para mandar'),
        e('a', { href: shortLink, target: '_blank', rel: 'noreferrer' }, shortLink.replace('https://www.', '')),
      ),
      e('div', { className: 'video-share-actions' },
        e('button', { type: 'button', className: 'btn ghost xs', onClick: copyShortLink },
          e(Icons.Copy, { width: 13, height: 13 }), copied ? '¡Copiado!' : 'Copiar'),
        e('a', { className: 'btn primary xs', href: `https://wa.me/?text=${encodeURIComponent(waText)}`, target: '_blank', rel: 'noreferrer' },
          e(Icons.WhatsApp, { width: 13, height: 13 }), 'WhatsApp'),
      ),
    ),

    videos.length === 0
      ? e('div', { className: 'video-empty' },
          e('strong', null, 'Esta propiedad todavía no tiene videos.'),
          e('span', null, 'Pegá el link del reel o de YouTube, o subí el video directo del celular.'))
      : e('div', { className: 'video-grid' },
          videos.map((v, i) => {
            const kind = kindOf(v);
            return e('div', { key: v._id || i, className: `video-card is-${kind}` },
              e(VideoPlayer, { video: v, index: i }),
              e('div', { className: 'video-card-meta' },
                e('span', { className: `video-kind is-${kind}` }, KIND_LABEL[kind]),
                (v.addedBy || v.addedAt) && e('span', { className: 'video-added' },
                  [v.addedBy, fmtDate(v.addedAt)].filter(Boolean).join(' · ')),
              ),
              e('div', { className: 'video-card-actions' },
                e('a', { className: 'btn ghost xs', href: v.url, target: '_blank', rel: 'noreferrer', title: 'Abrir el original' },
                  e(Icons.Eye, { width: 13, height: 13 }), 'Abrir'),
                e('button', {
                  className: 'btn danger xs', disabled: busyId === v._id, onClick: () => handleDelete(v), title: 'Quitar video',
                }, e(Icons.Trash, { width: 13, height: 13 }), busyId === v._id ? 'Quitando…' : 'Quitar'),
              ),
            );
          }),
        ),
  );
}
