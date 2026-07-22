'use client';
import React from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const e = React.createElement;
const { useState } = React;

// Los íconos default de Leaflet rompen con bundlers (rutas relativas a los .png) — se apunta
// directo al CDN, mismo patrón que ya usa web-silvia-next para su propio mapa.
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

// Zona habitual de operación (Mar Azul / Mar de las Pampas) — centro por defecto cuando la
// propiedad todavía no tiene coordenadas cargadas.
const DEFAULT_CENTER = [-37.34, -57.03];

function ClickHandler({ onMove }) {
  useMapEvents({ click(ev) { onMove(ev.latlng.lat, ev.latlng.lng); } });
  return null;
}

export default function PropertyMapCore({ property, onLocationChange }) {
  const hasCoords = !!(property.geo_lat && property.geo_long);
  const [position, setPosition] = useState(hasCoords ? [property.geo_lat, property.geo_long] : DEFAULT_CENTER);
  const [saving, setSaving] = useState(false);

  async function handleMove(lat, lng) {
    setPosition([lat, lng]);
    setSaving(true);
    try {
      await onLocationChange(lat, lng);
    } finally {
      setSaving(false);
    }
  }

  return e('div', { className: 'property-map-wrap' },
    e('p', { className: 'detail-section-sub' },
      'Hacé click en el mapa o arrastrá el marcador para actualizar la ubicación exacta de la propiedad.'),
    !hasCoords && e('div', { className: 'map-no-coords-note' },
      'Esta propiedad todavía no tiene coordenadas cargadas — se muestra un punto de referencia de la zona, hacé click para ubicarla.'),
    e('div', { className: `property-map${saving ? ' saving' : ''}` },
      e(MapContainer, {
        center: position, zoom: hasCoords ? 16 : 12,
        style: { height: 440, width: '100%', borderRadius: 14 },
      },
        e(TileLayer, {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        }),
        e(ClickHandler, { onMove: handleMove }),
        e(Marker, {
          position, icon: markerIcon, draggable: true,
          eventHandlers: {
            dragend: (ev) => {
              const { lat, lng } = ev.target.getLatLng();
              handleMove(lat, lng);
            },
          },
        }),
      ),
    ),
    e('div', { className: 'map-coords-readout' },
      e('span', null, `Lat: ${position[0].toFixed(6)}`),
      e('span', null, `Long: ${position[1].toFixed(6)}`),
    ),
  );
}
