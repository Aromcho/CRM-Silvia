'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { duplicateProperty } from '@/services/api';
import './DuplicatePropertyModal.css';

const e = React.createElement;
const { useState, useEffect, useRef } = React;

const OPERATION_OPTIONS = [
  { value: 'Alquiler temporal', label: 'Alquiler temporario', hint: 'Para publicarla como alquiler de temporada' },
  { value: 'Alquiler', label: 'Alquiler', hint: 'Para publicarla en alquiler tradicional' },
  { value: 'Venta', label: 'Venta', hint: 'Para publicarla en venta' },
];

// Rota estos textos mientras esperamos la respuesta real del backend — copiar las fotos a la
// carpeta nueva puede tardar unos segundos y una barra que no dice nada se siente trabada.
const LOADING_STEPS = ['Creando la copia…', 'Copiando fotos…', 'Casi listo…'];

export default function DuplicatePropertyModal({ property, onClose }) {
  const currentOp = property.operations?.[0]?.operation_type || '';
  const [operationType, setOperationType] = useState(
    OPERATION_OPTIONS.find((o) => o.value !== currentOp)?.value || OPERATION_OPTIONS[0].value
  );
  const [phase, setPhase] = useState('form'); // form | loading | done | error
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  async function handleConfirm() {
    setPhase('loading');
    setStepIndex(0);
    setError('');
    timerRef.current = setInterval(() => {
      setStepIndex((i) => (i < LOADING_STEPS.length - 1 ? i + 1 : i));
    }, 900);
    try {
      const result = await duplicateProperty(property.id, operationType);
      clearInterval(timerRef.current);
      setCreated(result);
      setPhase('done');
    } catch (err) {
      clearInterval(timerRef.current);
      setError(err.message || 'No se pudo duplicar la propiedad.');
      setPhase('error');
    }
  }

  function handleOverlayClick() {
    if (phase === 'loading') return;
    onClose();
  }

  const selectedLabel = OPERATION_OPTIONS.find((o) => o.value === operationType)?.label || operationType;

  return e('div', { className: 'dup-modal-overlay', onClick: handleOverlayClick },
    e('div', { className: 'dup-modal', onClick: (ev) => ev.stopPropagation() },
      phase !== 'loading' && e('button', {
        className: 'dup-modal-close', onClick: onClose, type: 'button', 'aria-label': 'Cerrar',
      }, e(Icons.Close, { width: 14, height: 14 })),

      phase === 'form' && e('div', { className: 'dup-modal-body' },
        e('div', { className: 'dup-modal-icon' }, e(Icons.Copy, { width: 20, height: 20 })),
        e('h2', null, 'Duplicar propiedad'),
        e('p', { className: 'dup-modal-hint' },
          `Se va a crear una copia de "${property.publication_title || property.address}" con un ID nuevo, para publicarla con otra operación sin tocar el original.`),
        e('div', { className: 'dup-modal-options' },
          OPERATION_OPTIONS.map((opt) => e('label', {
            key: opt.value,
            className: `dup-option${operationType === opt.value ? ' selected' : ''}`,
          },
            e('input', {
              type: 'radio', name: 'dup-operation', value: opt.value,
              checked: operationType === opt.value, onChange: () => setOperationType(opt.value),
            }),
            e('div', { className: 'dup-option-text' },
              e('div', { className: 'dup-option-label' }, opt.label),
              e('div', { className: 'dup-option-desc' }, opt.hint),
            ),
          )),
        ),
        e('div', { className: 'dup-modal-actions' },
          e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, 'Cancelar'),
          e('button', { type: 'button', className: 'btn primary sm', onClick: handleConfirm },
            e(Icons.Copy, { width: 13, height: 13 }), 'Duplicar propiedad'),
        ),
      ),

      phase === 'loading' && e('div', { className: 'dup-modal-body dup-modal-loading' },
        e('div', { className: 'dup-spinner' }),
        e('h2', null, 'Duplicando propiedad…'),
        e('p', { className: 'dup-modal-hint' }, LOADING_STEPS[stepIndex]),
      ),

      phase === 'error' && e('div', { className: 'dup-modal-body' },
        e('div', { className: 'dup-modal-icon error' }, e(Icons.Close, { width: 20, height: 20 })),
        e('h2', null, 'No se pudo duplicar'),
        e('p', { className: 'error-msg' }, error),
        e('div', { className: 'dup-modal-actions' },
          e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, 'Cerrar'),
          e('button', { type: 'button', className: 'btn primary sm', onClick: handleConfirm }, 'Reintentar'),
        ),
      ),

      phase === 'done' && created && e('div', { className: 'dup-modal-body' },
        e('div', { className: 'dup-modal-icon success' }, e(Icons.Check, { width: 20, height: 20 })),
        e('h2', null, '¡Copia lista!'),
        e('p', { className: 'dup-modal-hint' },
          `Se creó la propiedad #${created.id} en ${selectedLabel}. Fotos y datos generales quedaron copiados — revisá precio y detalles antes de publicarla.`),
        e('div', { className: 'dup-modal-actions' },
          e('button', { type: 'button', className: 'btn ghost sm', onClick: onClose }, 'Quedarme acá'),
          e('a', {
            className: 'btn primary sm', href: `/propiedades/${created.id}`, target: '_blank', rel: 'noopener noreferrer', onClick: onClose,
          }, 'Ir a la propiedad duplicada', e(Icons.ArrowRight, { width: 13, height: 13 })),
        ),
      ),
    ),
  );
}
