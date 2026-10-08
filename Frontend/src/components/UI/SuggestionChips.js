'use client';
import React from 'react';

const e = React.createElement;

// Botones de valores sugeridos debajo de un input. Muestra solo el último tramo de cada opción
// ("Argentina | Costa Atlantica | Mar Azul" -> "Mar Azul") y al elegir uno devuelve el valor completo.
// onMouseDown con preventDefault: el input no pierde el foco, así EditableField no guarda el
// borrador por su onBlur antes de recibir el valor elegido.
export default function SuggestionChips({ options, value, onPick }) {
  const current = String(value ?? '').trim().toLowerCase();
  return e('div', { className: 'suggestion-chips' },
    options.map((opt) => e('button', {
      key: opt,
      type: 'button',
      className: `suggestion-chip${opt.toLowerCase() === current ? ' active' : ''}`,
      title: opt,
      onMouseDown: (ev) => ev.preventDefault(),
      onClick: () => onPick(opt),
    }, opt.split('|').pop().trim())),
  );
}
