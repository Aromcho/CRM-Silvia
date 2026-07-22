'use client';
import React from 'react';
import dynamic from 'next/dynamic';

const e = React.createElement;

// Leaflet toca `window` al importarse — dynamic import con ssr:false para que nunca
// se intente cargar durante un render de servidor.
const PropertyMapCore = dynamic(() => import('./PropertyMapCore'), {
  ssr: false,
  loading: () => e('div', { className: 'map-loading' }, 'Cargando mapa…'),
});

export default function PropertyMap({ property, onLocationChange }) {
  return e(PropertyMapCore, { property, onLocationChange });
}
