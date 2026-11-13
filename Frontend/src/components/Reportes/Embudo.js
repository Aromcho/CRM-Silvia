'use client';
import React from 'react';
import { getFunnel } from '@/services/api';
import './Embudo.css';

// Reportes (C7): qué canal y qué asesor convierten. Consultas por origen, cómo avanzan
// (nuevas → conversación → reserva → cerradas), origen de las de la web y respuesta por asesor.

const e = React.createElement;
const { useState, useEffect } = React;

const SOURCE = { mercadolibre: 'MercadoLibre', zonaprop: 'ZonaProp', web: 'Web', whatsapp: 'WhatsApp', instagram: 'Instagram', manual: 'Carga manual', otro: 'Otro' };
const CHANNEL = { 'meta-ads': 'Anuncios de Meta', 'google-ads': 'Google Ads', google: 'Google', instagram: 'Instagram', facebook: 'Facebook', directo: 'Directo', 'otro-sitio': 'Otro sitio', 'sin dato': 'Sin dato' };
const RANGES = [30, 90, 365];

function Bar({ value, max, tone }) {
  const pct = max ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return e('span', { className: `emb-bar ${tone || ''}` }, e('span', { style: { width: `${pct}%` } }));
}

export default function Embudo() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    getFunnel(days).then(setData).catch((err) => setError(err.message || 'No se pudo cargar'));
  }, [days]);

  const maxSource = Math.max(1, ...(data?.bySource || []).map((s) => s.total));
  const s = data?.stages || {};
  const steps = [
    { key: 'nuevas', label: 'Sin responder', tone: 'warn' },
    { key: 'conversacion', label: 'En conversación' },
    { key: 'reserva', label: 'Reserva / seña' },
    { key: 'cerradas', label: 'Cerradas', tone: 'ok' },
  ];

  return e('section', { className: 'emb' },
    e('div', { className: 'emb-head' },
      e('div', null,
        e('h2', null, 'Consultas: de dónde vienen y cómo avanzan'),
        e('p', null, data ? `${data.total} consultas en los últimos ${data.days} días` : 'Cargando…'),
      ),
      e('div', { className: 'emb-range', role: 'tablist' },
        RANGES.map((d) => e('button', { key: d, type: 'button', className: days === d ? 'on' : '', onClick: () => setDays(d) }, d === 365 ? '1 año' : `${d} días`)),
      ),
    ),
    error && e('div', { className: 'emb-error' }, error),
    data && e('div', { className: 'emb-grid' },
      e('div', { className: 'emb-card' },
        e('h3', null, 'Por origen'),
        data.bySource.map((x) => e('div', { key: x.source, className: 'emb-row' },
          e('span', { className: 'emb-label' }, SOURCE[x.source] || x.source),
          e(Bar, { value: x.total, max: maxSource }),
          e('b', null, x.total),
          e('small', null, x.avanzaron ? `${Math.round((x.avanzaron / x.total) * 100)}% avanzó` : 'nadie avanzó'),
        )),
      ),
      e('div', { className: 'emb-card' },
        e('h3', null, 'Cómo avanzan'),
        steps.map((st) => e('div', { key: st.key, className: 'emb-row' },
          e('span', { className: 'emb-label' }, st.label),
          e(Bar, { value: s[st.key] || 0, max: Math.max(1, data.total), tone: st.tone }),
          e('b', null, s[st.key] || 0),
        )),
        (s.nuevas || 0) > data.total * 0.5 && e('p', { className: 'emb-note' },
          `${s.nuevas} de ${data.total} siguen como «nuevas»: si las movés en Consultas (contactado, reserva, cerrada) este reporte empieza a mostrar qué canal vende.`),
      ),
      e('div', { className: 'emb-card' },
        e('h3', null, 'Consultas de la web por campaña'),
        data.webChannels.length
          ? data.webChannels.map((c) => e('div', { key: c.channel, className: 'emb-row' },
              e('span', { className: 'emb-label' }, CHANNEL[c.channel] || c.channel),
              e(Bar, { value: c.total, max: Math.max(1, ...data.webChannels.map((x) => x.total)) }),
              e('b', null, c.total),
            ))
          : e('p', { className: 'emb-note' }, 'Todavía no hay consultas de la web en este período.'),
        e('p', { className: 'emb-note' }, '«Sin dato» son las anteriores al 13/11. Desde ese día cada consulta y cada WhatsApp de la web guardan si vinieron de un anuncio de Meta, de Google, de Instagram o directo.'),
      ),
      e('div', { className: 'emb-card' },
        e('h3', null, 'Por asesor'),
        e('div', { className: 'emb-table' },
          e('div', { className: 'emb-tr emb-th' }, e('span', null, 'Asesor'), e('span', null, 'Consultas'), e('span', null, 'Respondidas'), e('span', null, '1.ª respuesta'), e('span', null, 'Cierres')),
          data.agents.map((a) => e('div', { key: a.name, className: 'emb-tr' },
            e('span', null, a.name),
            e('span', null, a.total),
            e('span', null, a.total ? `${Math.round((a.respondidas / a.total) * 100)}%` : '—'),
            e('span', null, a.medianaHoras == null ? '—' : a.medianaHoras < 1 ? `${Math.round(a.medianaHoras * 60)} min` : `${a.medianaHoras} h`),
            e('span', null, a.cierres),
          )),
        ),
        e('p', { className: 'emb-note' }, 'La 1.ª respuesta se mide cuando el asesor toca WhatsApp, Llamar o Email desde Consultas; ese toque también le asigna la consulta si no tenía asesor.'),
      ),
    ),
  );
}
