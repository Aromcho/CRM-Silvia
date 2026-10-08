// Recibo de reserva: datos por defecto a partir de la reserva y armado de la hoja A4 (posiciones en pt).
// El mismo armado lo usan la vista previa (HTML) y el PDF (jsPDF), con la misma fuente (Carlito, la del
// recibo modelo) embebida en el PDF: así los cortes de línea coinciden y se ve igual en cualquier visor.

import { MONTH_NAMES, parseDateOnly, toISODate } from './rentalUtils';

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
const LEFT = 85;
const RIGHT = PAGE_W - 85;
const WIDTH = RIGHT - LEFT;
const BOTTOM = PAGE_H - 50;

export const RECEIPT_INK = '#111111';
const RED = '#e00000';
const HIGHLIGHT = '#ffff00';
const GREEN = '#1a7f45';
const MISSING = '__________';

export const RECEIPT_IMAGES = { photo: '/recibo/silvia-recibo.jpg', logo: '/recibo/logo.jpg' };
export const RECEIPT_FONTS = { normal: '/recibo/Carlito-Regular.ttf', bold: '/recibo/Carlito-Bold.ttf' };

const FOOTER_LINES = [
  'Martillera y Corredora Pública - Tomo III Folio 576 Mat. 1243.',
  'Calle 34 y Mar del Plata - MAR AZUL.',
  'Avenida Del Plata y Uritorco – MAR DE LAS PAMPAS',
];

export const BALANCE_TERMS = {
  USD: 'EN BILLETES DÓLARES ESTADOUNIDENSES FÍSICOS, CON SERIES POSTERIORES A 1996, COMÚNMENTE LLAMADOS “CARA GRANDE”, SIN DOBLECES, NI MARCAS, NI SELLOS, NI ESCRITURAS, ETC.',
  ARS: 'EN EFECTIVO O POR TRANSFERENCIA BANCARIA.',
};

export const PAYMENT_METHODS = ['Transferencia bancaria', 'Efectivo', 'Mercado Pago', 'Depósito bancario'];

const TYPE_LABELS = {
  casa: 'la casa', departamento: 'el departamento', cabana: 'la cabaña', duplex: 'el dúplex', ph: 'el PH',
  chalet: 'el chalet', monoambiente: 'el monoambiente', loft: 'el loft', complejo: 'la unidad',
};

function plain(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Temporada de la reserva → moneda de la tarifa (mismas monedas por defecto que el tarifario)
function seasonCurrency(rental, startIso) {
  const m = parseDateOnly(startIso)?.getMonth();
  const key = { 11: 'diciembre', 0: 'enero', 1: 'febrero', 2: 'marzo' }[m];
  const rates = rental?.seasonalRates || {};
  if (key) return rates[key]?.currency || (key === 'diciembre' ? 'ARS' : 'USD');
  return rates.invierno?.currency || 'ARS';
}

export function defaultReceipt({ property, booking, session }) {
  const rental = property?.temporaryRental || {};
  const address = String(property?.address || '').trim();
  const moneda = seasonCurrency(rental, booking?.startDate);
  const today = toISODate(new Date());
  return {
    fecha: today,
    asesor: String(session?.name || '').trim().split(/\s+/)[0] || '',
    tratamiento: '',
    nombre: booking?.guestName || '',
    dni: '',
    inmueble: TYPE_LABELS[plain(property?.type?.name)] || 'la propiedad',
    ubicacion: !address ? '' : /^(av|avda|avenida|calle|paseo|diagonal|ruta|boulevard|bv)\b/i.test(address) ? address : `calle ${address}`,
    localidad: rental.localidad || property?.location?.name || '',
    partido: 'Villa Gesell',
    desde: booking?.startDate?.slice(0, 10) || '',
    hasta: booking?.endDate?.slice(0, 10) || '',
    moneda,
    total: '',
    pagos: [{ medio: PAYMENT_METHODS[0], fecha: today, monto: '' }],
    incluirDeposito: true,
    deposito: '',
    condicionesSaldo: BALANCE_TERMS[moneda],
    penalidad: 'DE NO CUMPLIR CON LO PAUTADO EN ESTE RECIBO, SE PERDERÁ LA SEÑA YA ABONADA.',
    notas: 'NO OFRECEMOS SERVICIO DE ROPA BLANCA',
  };
}

// "2.200" / "2200" / "2200,50" → número (punto de miles y coma decimal, como se escribe acá)
export function parseAmount(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(n, moneda) {
  if (n == null) return null;
  // Espacio no separable: el símbolo nunca queda en un renglón y el número en el siguiente
  return `${moneda === 'USD' ? 'U$D' : '$'}\u00a0${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)}`;
}

export function receiptTotals(data) {
  const pagos = (data.pagos || []).map((p) => parseAmount(p.monto));
  const sena = pagos.some((n) => n != null) ? pagos.reduce((s, n) => s + (n || 0), 0) : null;
  const total = parseAmount(data.total);
  const saldo = total != null ? total - (sena || 0) : null;
  return { sena, total, saldo };
}

function longDate(iso, withYear = true) {
  const d = parseDateOnly(iso);
  if (!d) return null;
  return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()].toLowerCase()}${withYear ? ` del ${d.getFullYear()}` : ''}`;
}

function shortDate(iso) {
  const d = parseDateOnly(iso);
  if (!d) return null;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

function periodText(desde, hasta) {
  const s = parseDateOnly(desde), e = parseDateOnly(hasta);
  if (!s || !e) return null;
  const day = (d) => `${d.getDate()} de ${MONTH_NAMES[d.getMonth()].toLowerCase()}`;
  return s.getFullYear() === e.getFullYear()
    ? { from: day(s), to: `${day(e)} ${e.getFullYear()}` }
    : { from: `${day(s)} ${s.getFullYear()}`, to: `${day(e)} ${e.getFullYear()}` };
}

export function receiptFileName(data) {
  const name = plain(data.nombre).replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('_');
  return `Reserva_${name || 'sin_nombre'}.pdf`;
}

// ── Armado de la hoja ────────────────────────────────────────────────────────────────────────
// Un párrafo es una lista de tramos { text, bold, color, bg, underline, field, missing }. Se corta en
// palabras respetando el estilo de cada tramo y se ubica línea por línea; `measure(text, size, bold)`
// devuelve el ancho en pt (canvas en pantalla, jsPDF en el PDF).

const styleKey = (s) => `${s.bold ? 1 : 0}|${s.color || ''}|${s.bg || ''}|${s.underline ? 1 : 0}|${s.field || ''}|${s.missing ? 1 : 0}`;

// Valor cargado por el usuario, o rayita para completar a mano si está vacío
function val(text, field, style = {}) {
  const t = String(text ?? '').trim();
  return t ? { ...style, text: t, field } : { ...style, text: MISSING, field, missing: true };
}

function upper(runs) {
  return runs.map((r) => (r.missing ? r : { ...r, text: r.text.toUpperCase() }));
}

function tokenize(runs) {
  const words = [];
  let cur = null;
  for (const run of runs) {
    // Solo se corta en espacios comunes y saltos de línea (no en el espacio no separable)
    for (const part of String(run.text).split(/([ \t\n]+)/)) {
      if (!part) continue;
      if (/^[ \t\n]+$/.test(part)) {
        if (cur) { cur.closed = true; if (part.includes('\n')) cur.breakAfter = true; }
        continue;
      }
      if (!cur || cur.closed) { cur = { pieces: [] }; words.push(cur); }
      cur.pieces.push({ text: part, style: run });
    }
  }
  return words;
}

function makePager() {
  return { page: 0, y: 0 };
}

// Avanza el renglón; si no entra en la hoja, sigue arriba de la siguiente
function nextLine(pager, dy) {
  pager.y += dy;
  if (pager.y > BOTTOM) { pager.page += 1; pager.y = 72; }
}

function emitLine(items, pieces, x, y, size, pager, measure) {
  // Junta los pedazos contiguos con el mismo estilo (así el resaltado y el subrayado son continuos)
  const merged = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && styleKey(last.style) === styleKey(p.style)) last.text += p.text;
    else merged.push({ text: p.text, style: p.style });
  }
  let cx = x;
  for (const m of merged) {
    const w = measure(m.text, size, m.style.bold);
    items.push({ type: 'text', page: pager.page, x: cx, y, w, size, text: m.text, ...pick(m.style) });
    cx += w;
  }
  return cx;
}

function pick(s) {
  return { bold: !!s.bold, color: s.color || RECEIPT_INK, bg: s.bg || null, underline: !!s.underline, field: s.field || null, missing: !!s.missing };
}

function paragraph(items, pager, runs, { size, lineHeight, measure, x = LEFT, width = WIDTH }) {
  const words = tokenize(runs);
  const spaceW = measure(' ', size, false);
  let line = [], lineW = 0;
  const flush = () => {
    emitLine(items, line, x, pager.y, size, pager, measure);
    line = []; lineW = 0;
  };
  words.forEach((word, i) => {
    const w = word.pieces.reduce((s, p) => s + measure(p.text, size, p.style.bold), 0);
    if (line.length && lineW + spaceW + w > width) { flush(); nextLine(pager, lineHeight); }
    if (line.length) {
      // El espacio toma el estilo del tramo si la palabra anterior y la siguiente son del mismo tramo
      const prev = line[line.length - 1].style, next = word.pieces[0].style;
      line.push({ text: ' ', style: prev === next ? prev : {} });
      lineW += spaceW;
    }
    line.push(...word.pieces);
    lineW += w;
    if (word.breakAfter && i < words.length - 1) { flush(); nextLine(pager, lineHeight); }
  });
  if (line.length) flush();
}

// "TOTAL DEL ALQUILER: ........ U$D 2.200.-": etiqueta a la izquierda, monto alineado a la derecha
function leader(items, pager, left, right, { size, measure }) {
  const endLeft = emitLine(items, left, LEFT, pager.y, size, pager, measure);
  const rightW = right.reduce((s, p) => s + measure(p.text, size, p.style.bold), 0);
  const startRight = RIGHT - rightW;
  const dotW = measure('.', size, false);
  const n = Math.max(3, Math.floor((startRight - endLeft - 6) / dotW));
  items.push({ type: 'text', page: pager.page, x: endLeft + 3, y: pager.y, w: n * dotW, size, text: '.'.repeat(n), ...pick({}) });
  emitLine(items, right, startRight, pager.y, size, pager, measure);
}

const piece = (text, style = {}) => ({ text, style });

export function buildReceiptLayout(data, measure) {
  const items = [];
  const pager = makePager();
  const { sena, total, saldo } = receiptTotals(data);
  const money = (n) => formatMoney(n, data.moneda);

  // Encabezado: nombre de la inmobiliaria y foto
  items.push({ type: 'image', page: 0, key: 'photo', x: 365, y: 100, w: 104, h: 100 });
  const brand = 'Inmobiliaria  SILVIA  FERNÁNDEZ';
  items.push({ type: 'text', page: 0, x: LEFT + 3, y: 197, size: 9, charSpace: 2.4, w: measure(brand, 9, false) + 2.4 * brand.length, text: brand, ...pick({}) });
  items.push({ type: 'text', page: 0, x: LEFT, y: 229, size: 12, w: measure('RECIBO DE RESERVA', 12, true), text: 'RECIBO DE RESERVA', ...pick({ bold: true, underline: true }) });

  // Recibí de…
  pager.y = 260;
  const fecha = longDate(data.fecha);
  const trato = { 'SR.': 'DEL SR.', 'SRA.': 'DE LA SRA.' }[data.tratamiento] || 'DE';
  const inmueble = String(data.inmueble || '').trim() || 'la propiedad';
  // "el departamento" → "DEL DEPARTAMENTO ... UBICADO"; "la casa" → "DE LA CASA ... UBICADA"
  const masculino = /^el\s/i.test(inmueble);
  const ubicada = masculino ? 'UBICADO' : 'UBICADA';
  paragraph(items, pager, upper([
    { text: 'EL DÍA ' }, val(fecha, 'fecha'), { text: `, RECIBÍ ${trato} ` }, val(data.nombre, 'nombre'),
    { text: ' CON DNI ' }, val(data.dni, 'dni'), { text: ', LA SUMA DE ' }, val(money(sena), 'pagos'),
    { text: `.- CORRESPONDIENTE A LA RESERVA POR EL ALQUILER ${masculino ? 'DEL' : 'DE'} ` },
    { text: masculino ? inmueble.replace(/^el\s+/i, '') : inmueble, field: 'inmueble' },
    { text: ` ${ubicada} EN ` }, val(data.ubicacion, 'ubicacion'), { text: ' EN LA LOCALIDAD DE ' }, val(data.localidad, 'localidad'),
    { text: ', PARTIDO DE ' }, val(data.partido, 'partido'), { text: '.' },
  ]), { size: 9, lineHeight: 11, measure });

  nextLine(pager, 22);
  const period = periodText(data.desde, data.hasta);
  paragraph(items, pager, upper([
    { text: 'PERÍODO COMPRENDIDO DEL DÍA ' }, val(period?.from, 'desde'), { text: ' AL ' }, val(period?.to, 'hasta'), { text: '.' },
  ]), { size: 9, lineHeight: 11, measure });

  // Total y forma de pago de la seña
  nextLine(pager, 39);
  leader(items, pager,
    [piece('TOTAL DEL ALQUILER', { bold: true, underline: true }), piece(':', { bold: true })],
    total != null
      ? [piece(money(total), { bold: true, color: RED, field: 'total' }), piece('.-')]
      : [piece(MISSING, { field: 'total', missing: true })],
    { size: 11, measure });

  nextLine(pager, 26);
  emitLine(items, [piece('La reserva se abonó de la siguiente manera', { underline: true }), piece(':')], LEFT, pager.y, 10, pager, measure);
  const pagos = (data.pagos || []).filter((p, i) => i === 0 || p.medio || p.monto);
  pagos.forEach((p, i) => {
    nextLine(pager, i === 0 ? 25 : 15);
    const amount = parseAmount(p.monto);
    const label = [String(p.medio || '').trim(), shortDate(p.fecha)].filter(Boolean).join(' ');
    leader(items, pager,
      [label ? piece(label, { field: `pago-${i}-medio` }) : piece(MISSING, { field: `pago-${i}-medio`, missing: true })],
      amount != null ? [piece(money(amount), { field: `pago-${i}-monto` }), piece('.-')] : [piece(MISSING, { field: `pago-${i}-monto`, missing: true })],
      { size: 10, measure });
  });

  // Saldo al ingresar
  nextLine(pager, 24);
  const terms = String(data.condicionesSaldo || '').trim();
  if (saldo != null && saldo <= 0) {
    paragraph(items, pager, upper([{ text: 'EL ALQUILER SE ENCUENTRA TOTALMENTE ABONADO.' }]), { size: 10, lineHeight: 12.4, measure });
  } else {
    paragraph(items, pager, upper([
      { text: 'AL INGRESAR A LA PROPIEDAD SE ABONARÁ EL SALDO RESTANTE ' },
      saldo != null ? { text: money(saldo), bold: true, bg: HIGHLIGHT, field: 'total' } : { text: MISSING, field: 'total', missing: true },
      { text: terms ? '.- ' : '.-' }, terms && { text: terms, field: 'condicionesSaldo' },
    ].filter(Boolean)), { size: 10, lineHeight: 12.4, measure });
  }
  const penalty = String(data.penalidad || '').trim();
  if (penalty) {
    nextLine(pager, 12.4);
    paragraph(items, pager, upper([{ text: penalty, field: 'penalidad' }]), { size: 10, lineHeight: 12.4, measure });
  }

  // Depósito de garantía
  if (data.incluirDeposito) {
    nextLine(pager, 24.5);
    const dep = parseAmount(data.deposito);
    paragraph(items, pager, upper([
      { text: 'TAMBIÉN SE DEBERÁ DEJAR EN DEPÓSITO DE GARANTÍA LA SUMA DE ' },
      dep != null ? { text: money(dep), bold: true, color: RED, field: 'deposito' } : { text: MISSING, field: 'deposito', missing: true },
      { text: '.- QUE SE REINTEGRARÁ EN SU TOTALIDAD EL DÍA DE EGRESO, PREVIA REVISIÓN, ESTANDO TODO EN LAS MISMAS CONDICIONES RECIBIDAS.' },
    ]), { size: 10, lineHeight: 12.4, measure });
  }

  // Notas (una por renglón)
  const notes = String(data.notas || '').split('\n').map((s) => s.trim()).filter(Boolean);
  notes.forEach((n, i) => {
    nextLine(pager, i === 0 ? 24 : 14);
    paragraph(items, pager, upper([{ text: n, field: 'notas' }]), { size: 10, lineHeight: 12.4, measure });
  });

  nextLine(pager, 23);
  emitLine(items, [
    piece('ASESOR A CARGO', { bold: true, underline: true }), piece(': ', { bold: true }),
    String(data.asesor || '').trim() ? piece(String(data.asesor).trim(), { bold: true, field: 'asesor' }) : piece(MISSING, { field: 'asesor', missing: true }),
  ], LEFT, pager.y, 9, pager, measure);

  // Pie: firma, logo y datos de la martillera, alineados a la derecha
  if (pager.y + 115 > BOTTOM) { pager.page += 1; pager.y = 40; }
  nextLine(pager, 67);
  const logo = { w: 66, h: 47 };
  items.push({ type: 'image', page: pager.page, key: 'logo', x: RIGHT - logo.w, y: pager.y - logo.h + 1, w: logo.w, h: logo.h });
  const sign = 'Silvia A. Fernández Propiedades';
  const signW = measure(sign, 11, true);
  items.push({ type: 'text', page: pager.page, x: RIGHT - logo.w - 8 - signW, y: pager.y, size: 11, w: signW, text: sign, ...pick({ bold: true, underline: true, color: GREEN }) });
  FOOTER_LINES.forEach((line, i) => {
    nextLine(pager, i === 0 ? 23 : 12.5);
    const w = measure(line, 11, false);
    items.push({ type: 'text', page: pager.page, x: RIGHT - w, y: pager.y, size: 11, w, text: line, ...pick({ color: GREEN }) });
  });

  return { items, pages: pager.page + 1 };
}
