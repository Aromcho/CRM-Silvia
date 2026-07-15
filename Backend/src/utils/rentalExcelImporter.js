import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import Property from '../models/Property.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RENTAL_XLSX_PATH = process.env.RENTAL_XLSX_PATH
  || path.join(__dirname, '..', '..', 'data', 'rentals.xlsx');

const CAPACITY_SHEETS = ['1-4', '5-7', '8-12'];
const FACTS_SHEET = 'Hoja 4';

const LOCALITY_MAP = [
  [/^las gaviotas$/i, 'Las Gaviotas'],
  [/^gaviotas$/i, 'Las Gaviotas'],
  [/^m\.?\s?azul$/i, 'Mar Azul'],
  [/^mar azul$/i, 'Mar Azul'],
  [/^m\.?\s?pampas$/i, 'Mar de las Pampas'],
  [/^mar de las pampas$/i, 'Mar de las Pampas'],
  [/^pampas$/i, 'Mar de las Pampas'],
];

const HEADER_WORDS = new Set([
  'quincena', 'semana', 'dia', 'dias', 'día', 'días', 'dia/sem/quin', 'día/sem/quin',
  'valores inv.', 'valores diciembre', 'valores enero usd', 'valores febrero usd', 'valores marzo usd',
]);

function normalize(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

function isHeaderWord(v) {
  return HEADER_WORDS.has(normalize(v));
}

function parseNumber(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (isHeaderWord(v)) return undefined;
  const digits = String(v).replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  return parseInt(digits, 10);
}

function matchLocality(text) {
  const n = normalize(text);
  for (const [re, label] of LOCALITY_MAP) {
    if (re.test(n)) return label;
  }
  return null;
}

function isNumericId(text) {
  return /^\d{5,8}$/.test(String(text).trim());
}

/** Reads one of the capacity sheets (1-4 / 5-7 / 8-12) and returns one entry per property block. */
function parseCapacitySheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  const blocks = [];
  let current = null;

  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const col0 = String(row[0] || '').trim();
    const col1 = String(row[1] || '').trim();

    const isBlockStart = col0 && col1 && !isHeaderWord(col0);
    if (isBlockStart) {
      if (current) blocks.push(current);
      current = {
        name: col0,
        capacityLabel: col1,
        capacityGroup: sheetName,
        propertyId: null,
        localidad: null,
        unitLabel: null,
        rates: {},
        sourceRows: [i],
      };
      applyRatesFromRow(current, row);
      continue;
    }

    if (!current) continue;
    current.sourceRows.push(i);
    applyRatesFromRow(current, row);

    if (!col0) continue;

    if (isNumericId(col0)) {
      current.propertyId = parseInt(col0, 10);
      continue;
    }
    if (col0 === 'ID') continue; // placeholder, sin dato real

    const locality = matchLocality(col0);
    if (locality) {
      current.localidad = locality;
      continue;
    }

    if (!isHeaderWord(col0) && !current.unitLabel) {
      current.unitLabel = col0;
    }
  }
  if (current) blocks.push(current);

  return blocks;
}

function applyRatesFromRow(block, row) {
  const cols = {
    invierno: row[4],
    dic_q: row[5], dic_s: row[6], dic_d: row[7],
    ene_q: row[8], ene_s: row[9], ene_d: row[10],
    feb_q: row[11], feb_s: row[12], feb_d: row[13],
    mar_q: row[14], mar_s: row[15], mar_d: row[16],
  };
  const set = (key, val) => {
    const n = parseNumber(val);
    if (n !== undefined && block.rates[key] === undefined) block.rates[key] = n;
  };
  Object.entries(cols).forEach(([k, v]) => set(k, v));
}

function buildSeasonalRates(rates) {
  const hasAny = Object.keys(rates).length > 0;
  if (!hasAny) return undefined;
  return {
    invierno: rates.invierno !== undefined ? { price: rates.invierno, currency: 'ARS' } : undefined,
    diciembre: (rates.dic_q ?? rates.dic_s ?? rates.dic_d) !== undefined
      ? { quincena: rates.dic_q, semana: rates.dic_s, dia: rates.dic_d, currency: 'ARS' } : undefined,
    enero: (rates.ene_q ?? rates.ene_s ?? rates.ene_d) !== undefined
      ? { quincena: rates.ene_q, semana: rates.ene_s, dia: rates.ene_d, currency: 'USD' } : undefined,
    febrero: (rates.feb_q ?? rates.feb_s ?? rates.feb_d) !== undefined
      ? { quincena: rates.feb_q, semana: rates.feb_s, dia: rates.feb_d, currency: 'USD' } : undefined,
    marzo: (rates.mar_q ?? rates.mar_s ?? rates.mar_d) !== undefined
      ? { quincena: rates.mar_q, semana: rates.mar_s, dia: rates.mar_d, currency: 'USD' } : undefined,
  };
}

/** Reads "Hoja 4", the flat property/amenities master sheet. */
function parseFactsSheet(wb) {
  const ws = wb.Sheets[FACTS_SHEET];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const facts = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[1] || '').trim();
    if (!name) continue;
    const isSi = (v) => /^\s*si\s*$/i.test(String(v || ''));
    facts.push({
      localidad: String(row[0] || '').trim(),
      name,
      direccion: String(row[2] || '').trim(),
      capacityLabel: String(row[3] || '').trim(),
      distMar: String(row[4] || '').trim(),
      distCentro: String(row[5] || '').trim(),
      mascotas: isSi(row[6]),
      lavarropas: isSi(row[7]),
      artPlaya: isSi(row[8]),
      habitaciones: parseNumber(row[9]),
      banos: parseNumber(row[10]),
      escaleras: isSi(row[11]),
      cochera: isSi(row[12]),
    });
  }
  return facts;
}

/** Parses the reservations workbook at `xlsxPath` and upserts `Property.temporaryRental` for every matched property. Assumes an active mongoose connection. */
export async function importRentalExcelFile(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: true });

  const allBlocks = CAPACITY_SHEETS.flatMap((sheetName) => parseCapacitySheet(wb, sheetName));
  const facts = parseFactsSheet(wb);

  const seenIds = new Map();
  const unmatchedIds = [];
  let updated = 0;
  let duplicateIds = 0;

  for (const block of allBlocks) {
    if (!block.propertyId) {
      unmatchedIds.push(block.name);
      continue;
    }
    if (seenIds.has(block.propertyId)) duplicateIds++;
    seenIds.set(block.propertyId, block.name);

    const fact = facts.find((f) => normalize(f.name) === normalize(block.name))
      || facts.find((f) => normalize(f.name).includes(normalize(block.name)) || normalize(block.name).includes(normalize(f.name)));

    const temporaryRental = {
      localidad: block.localidad || fact?.localidad || undefined,
      capacity: block.capacityLabel || fact?.capacityLabel || undefined,
      capacityGroup: block.capacityGroup,
      unitLabel: block.unitLabel || undefined,
      distMar: fact?.distMar || undefined,
      distCentro: fact?.distCentro || undefined,
      mascotas: fact?.mascotas,
      lavarropas: fact?.lavarropas,
      artPlaya: fact?.artPlaya,
      escaleras: fact?.escaleras,
      cochera: fact?.cochera,
      seasonalRates: buildSeasonalRates(block.rates),
    };
    Object.keys(temporaryRental).forEach((k) => temporaryRental[k] === undefined && delete temporaryRental[k]);

    const existing = await Property.findOne({ id: block.propertyId }).select('id address temporaryRental').lean();
    if (!existing) continue;

    const merged = { ...(existing.temporaryRental || {}), ...temporaryRental };
    if (existing.temporaryRental?.bookings) merged.bookings = existing.temporaryRental.bookings;

    await Property.updateOne({ id: block.propertyId }, { $set: { temporaryRental: merged } });
    updated++;
  }

  const matchedFactNames = new Set(allBlocks.map((b) => normalize(b.name)));
  const unmatchedFacts = facts.filter((f) => {
    if (matchedFactNames.has(normalize(f.name))) return false;
    return !allBlocks.some((b) => normalize(f.name).includes(normalize(b.name)) || normalize(b.name).includes(normalize(f.name)));
  });

  return {
    blocksFound: allBlocks.length,
    factsFound: facts.length,
    updated,
    duplicateIds,
    unmatchedIds,
    unmatchedFacts: unmatchedFacts.map((f) => f.name),
  };
}
