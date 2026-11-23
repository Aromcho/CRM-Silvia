import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import Property from '../models/Property.model.js';
import { getBackendPublicUrl } from './publicUrl.js';

// Fotos subidas a mano al CRM: antes se guardaba solo el archivo original (2–3 MB, ~4000 px) y la
// web lo mostraba tal cual, así que en el celular cada foto tardaba segundos. Las fotos que venían
// de Tokko ya llegaban achicadas por Tokko, por eso esas «cargaban al instante». Ahora, como hacía
// Tokko, cada foto subida tiene tres archivos:
//   local_original → el original, sin tocar
//   local_image    → web_<nombre>.jpg, 1600 px de lado mayor (~200–400 KB): web, MercadoLibre, ZonaProp
//   local_thumb    → thumb_<nombre>.jpg, 480 px (~40 KB): miniaturas
// sharp ya está instalado en el Frontend del CRM (lo instala su build); el backend lo usa de ahí si no
// tiene uno propio. Si no se puede cargar, la foto queda como antes (solo original).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, '..', '..');
const UPLOADS_DIR = path.join(BACKEND_DIR, 'uploads', 'properties');
const require = createRequire(import.meta.url);

let sharpLib;
function loadSharp() {
  if (sharpLib !== undefined) return sharpLib;
  for (const base of [BACKEND_DIR, path.join(BACKEND_DIR, '..', 'Frontend')]) {
    try {
      sharpLib = require(require.resolve('sharp', { paths: [base] }));
      return sharpLib;
    } catch { /* se prueba el siguiente */ }
  }
  console.warn('[fotos] sharp no está disponible: las fotos subidas quedan solo en su tamaño original');
  sharpLib = null;
  return sharpLib;
}

const derivedName = (prefix, filename) => `${prefix}_${filename.replace(/\.[^.]+$/, '')}.jpg`;
const urlFor = (propertyId, filename) => `${getBackendPublicUrl()}/uploads/properties/${propertyId}/${filename}`;

// Crea web_ y thumb_ de un archivo ya guardado. Devuelve { local_image, local_thumb } o null.
export async function makePhotoVersions(propertyId, filename) {
  const sharp = loadSharp();
  if (!sharp) return null;
  const dir = path.join(UPLOADS_DIR, String(propertyId));
  const src = path.join(dir, filename);
  if (!fs.existsSync(src)) return null;
  const webName = derivedName('web', filename);
  const thumbName = derivedName('thumb', filename);
  try {
    await sharp(src).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(dir, webName));
    await sharp(src).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(dir, thumbName));
    return { local_image: urlFor(propertyId, webName), local_thumb: urlFor(propertyId, thumbName) };
  } catch (err) {
    console.error(`[fotos] No se pudo achicar ${propertyId}/${filename}:`, err.message);
    return null;
  }
}

// Archivos de una foto en disco (original + versiones), para borrarlos juntos
export function photoFiles(propertyId, photo) {
  const names = new Set(['local_image', 'local_original', 'local_thumb']
    .map((k) => photo?.[k]).filter(Boolean).map((u) => path.basename(String(u).split('?')[0])));
  return [...names].map((n) => path.join(UPLOADS_DIR, String(propertyId), n));
}

// Una vez al arrancar: las fotos subidas a mano que todavía no tienen su versión liviana.
export async function backfillPhotoVersions() {
  if (!loadSharp()) return 0;
  const props = await Property.find(
    { photos: { $elemMatch: { local_original: /\/manual_[^/]+$/ } } },
    { id: 1, photos: 1 },
  ).lean();
  let done = 0;
  let bytesOrig = 0;
  let bytesWeb = 0;
  let bytesThumb = 0;
  const missed = new Set();
  const odd = new Map();
  const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
  for (const p of props) {
    const dir = path.join(UPLOADS_DIR, String(p.id));
    for (const ph of p.photos || []) {
      const orig = ph.local_original || '';
      if (!/\/manual_[^/]+$/.test(orig)) continue;
      if (ph.local_image !== orig) {
        // Ya tiene versión liviana, salvo que apunte a otro archivo pesado (URL distinta del original).
        if (!/\/web_[^/]+$/.test(ph.local_image || '') && !odd.has(p.id)) odd.set(p.id, `${ph.local_image} | ${orig}`);
        continue;
      }
      const v = await makePhotoVersions(p.id, path.basename(orig));
      if (!v) continue;
      bytesOrig += size(path.join(dir, path.basename(orig)));
      bytesWeb += size(path.join(dir, path.basename(v.local_image)));
      bytesThumb += size(path.join(dir, path.basename(v.local_thumb)));
      // Se ubica la foto por su archivo original y no por _id: en 981976586 (copia de 992510326)
      // la versión liviana quedó creada en disco pero la ficha siguió apuntando al archivo pesado.
      const r = await Property.updateOne(
        { id: p.id },
        { $set: { 'photos.$[ph].local_image': v.local_image, 'photos.$[ph].local_thumb': v.local_thumb } },
        { arrayFilters: [{ 'ph.local_original': orig, 'ph.local_image': orig }] },
      );
      if (r.modifiedCount) done += 1;
      else missed.add(p.id);
    }
  }
  const kb = (b) => Math.round(b / Math.max(done, 1) / 1024);
  if (done) console.log(`[fotos] versión liviana creada para ${done} fotos subidas a mano — promedio: original ${kb(bytesOrig)} KB, web ${kb(bytesWeb)} KB, miniatura ${kb(bytesThumb)} KB`);
  for (const [id, urls] of odd) console.warn(`[fotos] ${id}: la foto no apunta a su versión liviana (${urls})`);
  console.log(`[fotos] revisadas ${props.length} fichas con fotos subidas a mano: ${done} fotos convertidas ahora, ${odd.size} fichas con URLs raras`);
  if (missed.size) console.warn(`[fotos] no se pudo actualizar la ficha de: ${[...missed].join(', ')}`);
  return done;
}
