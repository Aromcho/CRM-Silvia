'use client';
import React from 'react';
import './LineChart.css';

const e = React.createElement;
const { useState, useRef, useMemo } = React;

function niceMax(value) {
  if (value <= 0) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// Gráfico de línea simple, una sola serie — sin librerías, siguiendo la skill de dataviz:
// línea 2px, marcador de cierre >=8px con anillo de superficie, grilla recesiva, crosshair+tooltip.
export default function LineChart({ data, color = 'var(--green-600)', height = 220, valueLabel = 'Valor' }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const width = 720; // viewBox width — escala responsive via CSS (width:100%)
  const padding = { top: 16, right: 16, bottom: 28, left: 36 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxVal = useMemo(() => niceMax(Math.max(...data.map((d) => d.value), 0)), [data]);
  const n = data.length;

  function xFor(i) { return padding.left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1)); }
  function yFor(v) { return padding.top + plotH - (maxVal === 0 ? 0 : (plotH * v) / maxVal); }

  const points = data.map((d, i) => [xFor(i), yFor(d.value)]);
  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxVal * f));

  function handleMove(ev) {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((ev.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    points.forEach(([x], i) => {
      const dist = Math.abs(x - relX);
      if (dist < best) { best = dist; nearest = i; }
    });
    setHoverIdx(nearest);
  }

  if (n === 0) {
    return e('div', { className: 'linechart-empty' }, 'Todavía no hay datos para este período.');
  }

  const hover = hoverIdx != null ? data[hoverIdx] : null;
  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;
  const last = points[points.length - 1];

  return e('div', { className: 'linechart-root' },
    e('svg', {
      ref: svgRef, viewBox: `0 0 ${width} ${height}`, className: 'linechart-svg',
      onMouseMove: handleMove, onMouseLeave: () => setHoverIdx(null),
    },
      // gridlines + y ticks
      ticks.map((t, i) => e('g', { key: t + '-' + i },
        e('line', {
          x1: padding.left, x2: width - padding.right, y1: yFor(t), y2: yFor(t),
          className: 'linechart-grid',
        }),
        e('text', { x: padding.left - 8, y: yFor(t) + 4, textAnchor: 'end', className: 'linechart-tick' }, t.toLocaleString('es-AR')),
      )),
      // baseline
      e('line', {
        x1: padding.left, x2: width - padding.right, y1: yFor(0), y2: yFor(0), className: 'linechart-baseline',
      }),
      // x labels: first, last, and hover
      e('text', { x: xFor(0), y: height - 6, textAnchor: 'start', className: 'linechart-tick' }, formatDate(data[0].date)),
      n > 1 && e('text', { x: xFor(n - 1), y: height - 6, textAnchor: 'end', className: 'linechart-tick' }, formatDate(data[n - 1].date)),
      // line
      e('path', { d: pathD, className: 'linechart-line', style: { stroke: color } }),
      // end marker
      e('circle', { cx: last[0], cy: last[1], r: 5, className: 'linechart-end-dot', style: { fill: color } }),
      e('text', { x: last[0], y: last[1] - 10, textAnchor: 'end', className: 'linechart-end-label' }, String(data[n - 1].value)),
      // crosshair
      hoverPoint && e('line', {
        x1: hoverPoint[0], x2: hoverPoint[0], y1: padding.top, y2: padding.top + plotH, className: 'linechart-crosshair',
      }),
      hoverPoint && e('circle', { cx: hoverPoint[0], cy: hoverPoint[1], r: 5, className: 'linechart-hover-dot', style: { fill: color } }),
    ),
    hover && e('div', {
      className: 'linechart-tooltip',
      style: { left: `${(hoverPoint[0] / width) * 100}%` },
    },
      e('div', { className: 'linechart-tooltip-value' }, `${hover.value} ${valueLabel}`),
      e('div', { className: 'linechart-tooltip-date' }, formatDate(hover.date)),
    ),
  );
}
