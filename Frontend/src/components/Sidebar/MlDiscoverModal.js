'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { discoverMlExistingListings, linkMlExistingListing } from '@/services/api';
import './MlDiscoverModal.css';

const e = React.createElement;
const { useState, useEffect } = React;

const MATCH_LABELS = {
  seller_custom_field: { label: 'Alta confianza', tone: 'good' },
  title: { label: 'Por título — revisar', tone: 'warn' },
};

export default function MlDiscoverModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [linking, setLinking] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    discoverMlExistingListings()
      .then((res) => {
        const list = res.matches || [];
        setMatches(list);
        setUnmatched(res.unmatchedMlItems || []);
        setSelected(new Set(
          list.filter((m) => m.matchedBy === 'seller_custom_field' && !m.alreadyLinked).map((m) => m.item_id)
        ));
      })
      .catch((err) => setError(err.message || 'No se pudo consultar MercadoLibre.'))
      .finally(() => setLoading(false));
  }, []);

  function toggle(itemId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  async function handleLink() {
    setLinking(true);
    const toLink = matches.filter((m) => selected.has(m.item_id) && !m.alreadyLinked);
    let ok = 0;
    const errors = [];
    for (const m of toLink) {
      try {
        await linkMlExistingListing({ propertyId: m.propertyId, itemId: m.item_id, operationValue: m.operation_value });
        ok += 1;
      } catch (err) {
        errors.push({ item_id: m.item_id, error: err.message });
      }
    }
    setResult({ ok, failed: errors.length, errors });
    setLinking(false);
  }

  const linkableCount = matches.filter((m) => !m.alreadyLinked).length;

  return e('div', { className: 'ml-discover-overlay', onClick: onClose },
    e('div', { className: 'ml-discover-modal', onClick: (ev) => ev.stopPropagation() },
      e('div', { className: 'ml-discover-head' },
        e('h2', null, 'Vincular publicaciones existentes de MercadoLibre'),
        e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, e(Icons.Close, { width: 14, height: 14 })),
      ),
      e('p', { className: 'ml-discover-sub' },
        'Esto solo lee lo que ya está publicado en la cuenta conectada — no crea ni modifica nada en MercadoLibre. Confirmá los vínculos correctos para que el sync futuro actualice estos avisos en vez de crear duplicados.'),

      loading && e('div', { className: 'ml-discover-loading' }, e(Icons.RefreshCw, { width: 20, height: 20 }), 'Consultando MercadoLibre…'),
      error && e('div', { className: 'ml-discover-error' }, error),

      !loading && !error && e('div', { className: 'ml-discover-body' },
        matches.length === 0
          ? e('div', { className: 'ml-discover-empty' }, 'No se encontró ninguna coincidencia automática. Revisá manualmente las publicaciones sin matchear más abajo.')
          : e('table', { className: 'ml-discover-table' },
              e('thead', null, e('tr', null,
                e('th', null),
                e('th', null, 'Propiedad (CRM)'),
                e('th', null, 'Publicación (MercadoLibre)'),
                e('th', null, 'Operación'),
                e('th', null, 'Confianza'),
              )),
              e('tbody', null, matches.map((m) => e('tr', { key: m.item_id, className: m.alreadyLinked ? 'is-linked' : '' },
                e('td', null, m.alreadyLinked
                  ? e(Icons.Check, { width: 14, height: 14 })
                  : e('input', { type: 'checkbox', checked: selected.has(m.item_id), onChange: () => toggle(m.item_id) })),
                e('td', null, `#${m.propertyId} — ${m.propertyTitle}`),
                e('td', null, e('a', { href: m.permalink, target: '_blank', rel: 'noopener noreferrer' }, m.title)),
                e('td', null, m.operation_value || '—'),
                e('td', null, m.alreadyLinked
                  ? e('span', { className: 'ml-discover-badge good' }, 'Ya vinculada')
                  : e('span', { className: `ml-discover-badge ${MATCH_LABELS[m.matchedBy]?.tone || 'warn'}` }, MATCH_LABELS[m.matchedBy]?.label || m.matchedBy)),
              ))),
            ),

        unmatched.length > 0 && e('div', { className: 'ml-discover-unmatched' },
          e('button', { type: 'button', className: 'btn ghost xs', onClick: () => setShowUnmatched((v) => !v) },
            `${showUnmatched ? 'Ocultar' : 'Ver'} publicaciones sin matchear (${unmatched.length})`),
          showUnmatched && e('ul', null, unmatched.map((u) => e('li', { key: u.item_id },
            e('a', { href: u.permalink, target: '_blank', rel: 'noopener noreferrer' }, u.title),
          ))),
        ),

        result && e('div', { className: 'ml-discover-result' },
          `Vinculadas: ${result.ok}${result.failed ? ` — ${result.failed} con error` : ''}`,
          result.errors.map((er) => e('div', { key: er.item_id, className: 'ml-listing-error' }, `${er.item_id}: ${er.error}`)),
        ),
      ),

      !loading && !error && linkableCount > 0 && e('div', { className: 'ml-discover-footer' },
        e('button', {
          type: 'button', className: 'btn primary sm', disabled: linking || selected.size === 0, onClick: handleLink,
        }, linking ? 'Vinculando…' : `Vincular seleccionadas (${selected.size})`),
      ),
    ),
  );
}
