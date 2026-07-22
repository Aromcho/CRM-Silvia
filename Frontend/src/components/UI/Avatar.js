'use client';
import React from 'react';

const e = React.createElement;
const { useState, useEffect } = React;

// Mismo algoritmo que se usaba duplicado en Sidebar.js/Users.js/Leads.js — círculo de
// iniciales con color hasheado, usado como fallback cuando no hay foto en /avatar/.
const AVATAR_PALETTE = ['#15784f', '#2563eb', '#b8791b', '#7257c9', '#0e8a8a', '#d8504a'];
function colorOf(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function initials(name) {
  const p = String(name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '?') + (p[1]?.[0] || '')).toUpperCase();
}

// Convención de archivo: Frontend/public/avatar/<email en minúsculas>.png
export default function Avatar({ email, name, size = 32, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [email]);

  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  const src = email ? `/avatar/${String(email).trim().toLowerCase()}.png` : null;

  if (src && !failed) {
    return e('img', {
      src,
      alt: name || email,
      className: `avatar avatar-photo ${className}`.trim(),
      style,
      onError: () => setFailed(true),
    });
  }

  return e('span', {
    className: `avatar avatar-pop ${className}`.trim(),
    style: { ...style, background: colorOf(email || name || '') },
  }, initials(name));
}
