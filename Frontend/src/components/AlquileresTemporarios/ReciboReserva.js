'use client';
import React from 'react';
import Icons from '../Icons/Icons';
import { propertyTitle, useEscape } from './rentalUtils';
import {
  PAGE_W, PAGE_H, RECEIPT_IMAGES, RECEIPT_FONTS, BALANCE_TERMS, PAYMENT_METHODS,
  defaultReceipt, buildReceiptLayout, receiptTotals, formatMoney, receiptFileName,
} from './reciboLayout';
import './ReciboReserva.css';

const e = React.createElement;
const { useState, useEffect, useMemo, useRef, useCallback } = React;

const PX = 96 / 72; // pt → px
const FONT_FAMILY = 'Recibo Carlito';
// Recorte de la foto de la hoja (igual en pantalla y en el PDF): centrada
const PHOTO_POS = { x: 0.5, y: 0.5 };

// La fuente del recibo se baja una sola vez: se registra para la vista previa y los mismos bytes se
// embeben en el PDF.
let fontsPromise = null;
function loadReceiptFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(Object.entries(RECEIPT_FONTS).map(async ([style, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo cargar ${url}`);
      const buf = await res.arrayBuffer();
      const face = new FontFace(FONT_FAMILY, buf.slice(0), { weight: style === 'bold' ? '700' : '400' });
      await face.load();
      document.fonts.add(face);
      return [style, buf];
    })).then(Object.fromEntries).catch((err) => { fontsPromise = null; throw err; });
  }
  return fontsPromise;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return window.btoa(bin);
}

let measureCtx = null;
// Ancho del texto en pantalla, en pt. Se mide a 100px y se escala para no depender del redondeo.
// Sin kerning ni ligaduras, igual que jsPDF.
function screenMeasure(text, size, bold) {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d');
    try { measureCtx.fontKerning = 'none'; measureCtx.textRendering = 'optimizeSpeed'; } catch { /* navegadores viejos */ }
  }
  measureCtx.font = `${bold ? 'bold ' : ''}100px "${FONT_FAMILY}"`;
  return (measureCtx.measureText(text).width * size) / 100;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

// Imagen recortada al tamaño del recuadro (como object-fit: cover) y pasada a JPEG para el PDF
async function imageForPdf(src, w, h, pos = { x: 0.5, y: 0.5 }) {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, (w - dw) * pos.x, (h - dh) * pos.y, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.9);
}

function drawItem(doc, it, images) {
  if (it.type === 'image') {
    doc.addImage(images[it.key], 'JPEG', it.x, it.y, it.w, it.h);
    return;
  }
  doc.setFont('Carlito', it.bold ? 'bold' : 'normal');
  doc.setFontSize(it.size);
  if (it.bg) {
    doc.setFillColor(it.bg);
    doc.rect(it.x, it.y - it.size * 0.8, it.w, it.size * 1.02, 'F');
  }
  doc.setTextColor(it.color);
  doc.text(it.text, it.x, it.y, it.charSpace ? { charSpace: it.charSpace } : undefined);
  if (it.underline) {
    doc.setDrawColor(it.color);
    doc.setLineWidth(Math.max(0.5, it.size * 0.06));
    doc.line(it.x, it.y + it.size * 0.14, it.x + it.w, it.y + it.size * 0.14);
  }
}

async function downloadPdf(data) {
  const [{ jsPDF }, fonts, photo, logo] = await Promise.all([
    import('jspdf'),
    loadReceiptFonts(),
    imageForPdf(RECEIPT_IMAGES.photo, 416, 400, PHOTO_POS),
    imageForPdf(RECEIPT_IMAGES.logo, 396, 282),
  ]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('Carlito-Regular.ttf', toBase64(fonts.normal));
  doc.addFont('Carlito-Regular.ttf', 'Carlito', 'normal');
  doc.addFileToVFS('Carlito-Bold.ttf', toBase64(fonts.bold));
  doc.addFont('Carlito-Bold.ttf', 'Carlito', 'bold');
  const measure = (text, size, bold) => {
    doc.setFont('Carlito', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    return doc.getTextWidth(text);
  };
  const { items, pages } = buildReceiptLayout(data, measure);
  for (let p = 0; p < pages; p++) {
    if (p) doc.addPage();
    items.filter((it) => it.page === p).forEach((it) => drawItem(doc, it, { photo, logo }));
  }
  doc.setProperties({ title: `Recibo de reserva - ${data.nombre || ''}`.trim(), author: 'Silvia A. Fernández Propiedades' });
  doc.save(receiptFileName(data));
}

function Sheet({ items, page, onField }) {
  return e('div', { className: 'recibo-sheet', style: { width: PAGE_W * PX, height: PAGE_H * PX } },
    items.filter((it) => it.page === page).map((it, i) => {
      if (it.type === 'image') {
        return e('img', {
          key: i, src: RECEIPT_IMAGES[it.key], alt: '', draggable: false,
          style: { left: it.x * PX, top: it.y * PX, width: it.w * PX, height: it.h * PX, objectPosition: it.key === 'photo' ? `${PHOTO_POS.x * 100}% ${PHOTO_POS.y * 100}%` : undefined },
        });
      }
      const cls = ['recibo-text', it.field && 'has-field', it.missing && 'missing'].filter(Boolean).join(' ');
      return e('span', {
        key: i, className: cls,
        title: it.field ? 'Click para editar' : undefined,
        onClick: it.field ? () => onField(it.field) : undefined,
        style: {
          left: it.x * PX, top: (it.y - it.size * 0.847) * PX, width: it.w * PX,
          fontSize: it.size * PX, lineHeight: `${it.size * PX}px`, fontWeight: it.bold ? 700 : 400,
          color: it.missing ? undefined : it.color, background: it.bg || undefined,
          textDecoration: it.underline ? 'underline' : undefined, letterSpacing: it.charSpace ? it.charSpace * PX : undefined,
        },
      }, it.text);
    }),
  );
}

// Vista previa: la hoja A4 achicada para que entre a lo ancho del panel
function Preview({ layout, onField }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1.15, (el.clientWidth - 32) / (PAGE_W * PX)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = PAGE_W * PX * scale, h = PAGE_H * PX * scale;
  return e('div', { className: 'recibo-preview', ref },
    !layout && e('div', { className: 'recibo-sheet-frame loading', style: { width: w, height: h } }, 'Preparando la hoja…'),
    layout && Array.from({ length: layout.pages }, (_, p) => e('div', { key: p, className: 'recibo-sheet-frame', style: { width: w, height: h } },
      e('div', { style: { transform: `scale(${scale})`, transformOrigin: '0 0' } }, e(Sheet, { items: layout.items, page: p, onField })),
    )),
    e('p', { className: 'recibo-preview-tip' }, e(Icons.Edit, { width: 12, height: 12 }), 'Tocá cualquier dato de la hoja para editarlo'),
  );
}

function Field({ id, label, hint, wide, children }) {
  return e('div', { className: `field rc-field${wide ? ' wide' : ''}`, 'data-for': id },
    e('label', { htmlFor: id }, label),
    children,
    hint && e('span', { className: 'rc-hint' }, hint),
  );
}

export default function ReciboReserva({ property, booking, session, onClose }) {
  const storageKey = `recibo-reserva:${property.id}:${booking._id || `${booking.startDate}-${booking.endDate}`}`;
  const defaults = useMemo(() => defaultReceipt({ property, booking, session }), [property, booking, session]);
  const [initial] = useState(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return { data: { ...defaults, ...JSON.parse(raw) }, restored: true };
    } catch { /* sin almacenamiento: se arranca de cero */ }
    return { data: defaults, restored: false };
  });
  const [data, setData] = useState(initial.data);
  const [restored, setRestored] = useState(initial.restored);
  const [view, setView] = useState('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadReceiptFonts()
      .then(() => { if (alive) setFontsReady(true); })
      .catch((err) => { console.error(err); if (alive) setError('No se pudo cargar la fuente del recibo. Revisá la conexión y volvé a abrirlo.'); });
    return () => { alive = false; };
  }, []);

  // Borrador en este dispositivo, para no perder lo cargado si se cierra sin descargar
  useEffect(() => {
    try {
      if (JSON.stringify(data) === JSON.stringify(defaults)) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch { /* ignore */ }
  }, [data, defaults, storageKey]);

  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useEscape(close);

  const layout = useMemo(() => (fontsReady ? buildReceiptLayout(data, screenMeasure) : null), [data, fontsReady]);
  const { sena, total, saldo } = receiptTotals(data);
  const money = (n) => formatMoney(n, data.moneda);

  const set = (k) => (ev) => {
    const v = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    setData((d) => ({ ...d, [k]: v }));
  };

  function setMoneda(m) {
    setData((d) => ({
      ...d, moneda: m,
      // Si la forma de pago del saldo es la de la otra moneda (no se tocó), se cambia por la que corresponde
      condicionesSaldo: d.condicionesSaldo === BALANCE_TERMS[d.moneda] ? BALANCE_TERMS[m] : d.condicionesSaldo,
    }));
  }

  const setPago = (i, k) => (ev) => setData((d) => ({ ...d, pagos: d.pagos.map((p, j) => (j === i ? { ...p, [k]: ev.target.value } : p)) }));
  const addPago = () => setData((d) => ({ ...d, pagos: [...d.pagos, { medio: '', fecha: d.fecha, monto: '' }] }));
  const removePago = (i) => setData((d) => ({ ...d, pagos: d.pagos.filter((_, j) => j !== i) }));

  function reset() {
    setData(defaults);
    setRestored(false);
  }

  // Click en un dato de la hoja → se enfoca su campo (en celular/tablet, pasando a la pestaña Datos)
  function focusField(field) {
    const id = `rc-${field === 'pagos' ? 'pago-0-monto' : field}`;
    setView('form');
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
      setFlash(id);
      setTimeout(() => setFlash((f) => (f === id ? null : f)), 1200);
    });
  }

  async function handleDownload() {
    setBusy(true);
    setError('');
    try {
      await downloadPdf(data);
    } catch (err) {
      console.error(err);
      setError('No se pudo generar el PDF. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  const input = (k, props = {}) => e('input', { id: `rc-${k}`, value: data[k] ?? '', onChange: set(k), className: flash === `rc-${k}` ? 'flash' : undefined, ...props });
  const textarea = (k, props = {}) => e('textarea', { id: `rc-${k}`, value: data[k] ?? '', onChange: set(k), className: flash === `rc-${k}` ? 'flash' : undefined, rows: 3, ...props });
  const amountProps = { inputMode: 'decimal', placeholder: '0', autoComplete: 'off' };

  const form = e('div', { className: 'recibo-form' },
    restored && e('div', { className: 'rc-note' },
      e(Icons.Check, { width: 13, height: 13 }),
      e('span', null, 'Se recuperó lo que habías cargado en este dispositivo.'),
      e('button', { type: 'button', className: 'btn ghost xs', onClick: reset }, 'Empezar de nuevo'),
    ),

    e('section', { className: 'rc-section' },
      e('h3', null, e(Icons.User, { width: 14, height: 14 }), 'Huésped'),
      e('div', { className: 'rc-grid' },
        e(Field, { id: 'rc-tratamiento', label: 'Sr. / Sra.' },
          e('select', { id: 'rc-tratamiento', value: data.tratamiento, onChange: set('tratamiento') },
            e('option', { value: '' }, '—'), e('option', { value: 'SRA.' }, 'Sra.'), e('option', { value: 'SR.' }, 'Sr.'))),
        e(Field, { id: 'rc-dni', label: 'DNI' }, input('dni', { inputMode: 'numeric', placeholder: 'Ej: 30.123.456' })),
        e(Field, { id: 'rc-nombre', label: 'Nombre y apellido', wide: true }, input('nombre', { placeholder: 'Nombre del huésped' })),
      ),
    ),

    e('section', { className: 'rc-section' },
      e('h3', null, e(Icons.Building, { width: 14, height: 14 }), 'Alquiler'),
      e('div', { className: 'rc-grid' },
        e(Field, { id: 'rc-inmueble', label: 'Inmueble', hint: 'Ej: la casa, el departamento' }, input('inmueble')),
        e(Field, { id: 'rc-ubicacion', label: 'Ubicado en' }, input('ubicacion', { placeholder: 'calle Los Aromos 123' })),
        e(Field, { id: 'rc-localidad', label: 'Localidad' }, input('localidad')),
        e(Field, { id: 'rc-partido', label: 'Partido' }, input('partido')),
        e(Field, { id: 'rc-desde', label: 'Entrada' }, input('desde', { type: 'date' })),
        e(Field, { id: 'rc-hasta', label: 'Salida' }, input('hasta', { type: 'date', min: data.desde || undefined })),
      ),
    ),

    e('section', { className: 'rc-section' },
      e('h3', null, e(Icons.DollarSign, { width: 14, height: 14 }), 'Montos'),
      e('div', { className: 'rc-grid' },
        e(Field, { id: 'rc-moneda', label: 'Moneda' },
          e('div', { className: 'rc-seg', role: 'group', id: 'rc-moneda' },
            [['USD', 'Dólares (U$D)'], ['ARS', 'Pesos ($)']].map(([k, label]) => e('button', {
              key: k, type: 'button', className: data.moneda === k ? 'on' : '', 'aria-pressed': data.moneda === k, onClick: () => setMoneda(k),
            }, label)))),
        e(Field, { id: 'rc-total', label: 'Total del alquiler' }, input('total', amountProps)),
      ),

      e('div', { className: 'rc-subhead' }, 'Pagos de la seña'),
      e('div', { className: 'rc-pagos' },
        data.pagos.map((p, i) => e('div', { key: i, className: 'rc-pago' },
          e('div', { className: 'field rc-field' },
            e('label', { htmlFor: `rc-pago-${i}-medio` }, data.pagos.length > 1 ? `Pago ${i + 1}` : 'Medio de pago'),
            e('input', { id: `rc-pago-${i}-medio`, list: 'rc-medios', value: p.medio, onChange: setPago(i, 'medio'), placeholder: 'Transferencia bancaria', className: flash === `rc-pago-${i}-medio` ? 'flash' : undefined, 'aria-label': 'Medio de pago' })),
          e('div', { className: 'field rc-field' },
            e('label', { htmlFor: `rc-pago-${i}-fecha` }, 'Fecha'),
            e('input', { id: `rc-pago-${i}-fecha`, type: 'date', value: p.fecha, onChange: setPago(i, 'fecha'), 'aria-label': 'Fecha del pago' })),
          e('div', { className: 'field rc-field' },
            e('label', { htmlFor: `rc-pago-${i}-monto` }, 'Monto'),
            e('input', { id: `rc-pago-${i}-monto`, value: p.monto, onChange: setPago(i, 'monto'), className: flash === `rc-pago-${i}-monto` ? 'flash' : undefined, 'aria-label': 'Monto del pago', ...amountProps })),
          e('button', {
            type: 'button', className: 'icon-btn danger rc-pago-del', title: 'Quitar pago', 'aria-label': 'Quitar pago',
            onClick: () => removePago(i), disabled: data.pagos.length === 1,
          }, e(Icons.Trash, { width: 13, height: 13 })),
        )),
        e('datalist', { id: 'rc-medios' }, PAYMENT_METHODS.map((m) => e('option', { key: m, value: m }))),
        e('button', { type: 'button', className: 'btn ghost xs rc-add', onClick: addPago }, e(Icons.Plus, { width: 12, height: 12 }), 'Agregar otro pago'),
      ),

      e('div', { className: 'rc-totals' },
        e('div', null, e('span', null, 'Seña recibida'), e('strong', null, money(sena) || '—')),
        e('div', { className: saldo != null && saldo < 0 ? 'bad' : '' }, e('span', null, 'Saldo al ingresar'),
          e('strong', null, saldo == null ? (total == null ? 'Falta el total' : '—') : saldo <= 0 ? (saldo < 0 ? `${money(saldo)} (revisar)` : 'Pagado') : money(saldo))),
      ),

      e('label', { className: 'rc-check' },
        e('input', { type: 'checkbox', checked: !!data.incluirDeposito, onChange: set('incluirDeposito') }),
        'Incluir depósito de garantía'),
      data.incluirDeposito && e('div', { className: 'rc-grid' },
        e(Field, { id: 'rc-deposito', label: 'Depósito de garantía' }, input('deposito', amountProps)),
      ),
    ),

    e('section', { className: 'rc-section' },
      e('h3', null, e(Icons.FileText, { width: 14, height: 14 }), 'Condiciones y notas'),
      e(Field, { id: 'rc-condicionesSaldo', label: 'Cómo se paga el saldo', wide: true }, textarea('condicionesSaldo', { rows: 4 })),
      e(Field, { id: 'rc-penalidad', label: 'Si no se cumple', wide: true }, textarea('penalidad', { rows: 2 })),
      e(Field, { id: 'rc-notas', label: 'Notas', hint: 'Cada renglón sale como un párrafo aparte', wide: true }, textarea('notas', { rows: 2 })),
    ),

    e('section', { className: 'rc-section' },
      e('h3', null, e(Icons.Calendar, { width: 14, height: 14 }), 'Recibo'),
      e('div', { className: 'rc-grid' },
        e(Field, { id: 'rc-fecha', label: 'Fecha del recibo' }, input('fecha', { type: 'date' })),
        e(Field, { id: 'rc-asesor', label: 'Asesor a cargo' }, input('asesor')),
      ),
    ),
  );

  const title = data.nombre?.trim() || booking.guestName || 'Reserva';

  return e('div', { className: 'recibo-overlay', role: 'dialog', 'aria-modal': true, 'aria-label': 'Recibo de reserva' },
    e('header', { className: 'recibo-head' },
      e('button', { type: 'button', className: 'icon-btn recibo-close', onClick: close, 'aria-label': 'Cerrar', title: 'Cerrar' }, e(Icons.Close, { width: 15, height: 15 })),
      e('div', { className: 'recibo-title' },
        e('h2', null, 'Recibo de reserva'),
        e('span', null, `${title} · ${propertyTitle(property)}`),
      ),
      e('div', { className: 'recibo-actions' },
        e('button', { type: 'button', className: 'btn ghost sm recibo-reset', onClick: reset, title: 'Volver a los datos de la reserva' },
          e(Icons.RefreshCw, { width: 13, height: 13 }), 'Restablecer'),
        e('button', { type: 'button', className: 'btn primary sm', onClick: handleDownload, disabled: busy || !fontsReady },
          e(Icons.Download, { width: 14, height: 14 }), busy ? 'Generando…' : 'Descargar PDF'),
      ),
    ),
    error && e('div', { className: 'recibo-error' }, e(Icons.AlertTriangle, { width: 13, height: 13 }), error),
    e('div', { className: 'recibo-tabs', role: 'tablist' },
      [['form', 'Datos', Icons.Edit], ['preview', 'Vista previa', Icons.Eye]].map(([k, label, icon]) => e('button', {
        key: k, type: 'button', role: 'tab', 'aria-selected': view === k, className: view === k ? 'on' : '', onClick: () => setView(k),
      }, e(icon, { width: 14, height: 14 }), label)),
    ),
    e('div', { className: 'recibo-body', 'data-view': view },
      form,
      e(Preview, { layout, onField: focusField }),
    ),
  );
}
