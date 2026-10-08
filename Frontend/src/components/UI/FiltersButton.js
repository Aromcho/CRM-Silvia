'use client';
import React from 'react';
import Icons from '../Icons/Icons';

const e = React.createElement;

// Botón "Filtros" que solo aparece en celular (globals.css): pliega/despliega el bloque de filtros
// marcado con `filters-collapsible` y muestra cuántos hay activos.
export default function FiltersButton({ open, count = 0, onToggle }) {
  return e('button', {
    type: 'button', className: `filters-toggle${open ? ' on' : ''}`, 'aria-expanded': open, onClick: onToggle,
  },
    e(Icons.Filter, { width: 14, height: 14 }),
    'Filtros',
    count > 0 && e('span', { className: 'filters-toggle-n' }, count),
  );
}
