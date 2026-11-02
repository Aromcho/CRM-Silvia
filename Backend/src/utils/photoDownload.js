import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBackendPublicUrl } from './publicUrl.js';

// Descarga fotos remotas a uploads/properties/<id>/ y arma las entradas de `Property.photos`.
// Antes vivía en syncWithTokko.js; quedó acá al eliminar la sincronización con Tokko porque la
// usa la importación puntual de avisos de MercadoLibre (scripts/importSingleMercadoLibreProperty.js).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'properties');

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) return true;
  try {
    const response = await axios.get(url, { responseType: 'stream', timeout: 15000 });
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    return true;
  } catch (err) {
    console.warn(`  [img] No se pudo descargar ${url}: ${err.message}`);
    return false;
  }
}

function safeFilename(str) {
  return String(str).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function localUrl(propertyId, filename) {
  return `${getBackendPublicUrl()}/uploads/properties/${propertyId}/${filename}`;
}

export async function processPhotos(photos, propertyId) {
  const result = [];
  const propDir = path.join(UPLOADS_DIR, String(propertyId));

  for (let i = 0; i < photos.length; i++) {
    const img = photos[i];
    const srcUrl = img.original || img.image || '';
    const thumbUrl = img.thumb || srcUrl;

    if (!srcUrl) {
      result.push({ description: img.description || '', is_blueprint: img.is_blueprint || false, is_front_cover: img.is_front_cover || false, order: img.order || i, original_url: '', image_url: '', thumb_url: '', social_media_url: img.social_media_url || '', local_image: '', local_original: '', local_thumb: '' });
      continue;
    }

    const ext = (srcUrl.split('.').pop() || 'jpg').split('?')[0].toLowerCase().slice(0, 4);
    const filename = safeFilename(`photo_${i}_${img.order ?? i}.${ext}`);
    const thumbFilename = safeFilename(`thumb_${i}_${img.order ?? i}.${ext}`);

    const origOk = await downloadImage(srcUrl, path.join(propDir, filename));
    let thumbOk = false;
    if (thumbUrl && thumbUrl !== srcUrl) {
      thumbOk = await downloadImage(thumbUrl, path.join(propDir, thumbFilename));
    }

    result.push({
      description: img.description || '',
      is_blueprint: img.is_blueprint || false,
      is_front_cover: img.is_front_cover || false,
      order: img.order ?? i,
      original_url: srcUrl,
      image_url: img.image || srcUrl,
      thumb_url: thumbUrl,
      social_media_url: img.social_media_url || '',
      local_image: origOk ? localUrl(propertyId, filename) : '',
      local_original: origOk ? localUrl(propertyId, filename) : '',
      local_thumb: thumbOk ? localUrl(propertyId, thumbFilename) : (origOk ? localUrl(propertyId, filename) : ''),
    });
  }

  return result;
}
