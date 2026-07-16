import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'properties');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const base = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
  return `${base}/uploads/properties/${propertyId}/${filename}`;
}

async function processPhotos(photos, propertyId) {
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

export const syncWithTokko = async () => {
  const limit = 20;
  let offset = 0;
  let total_count = 0;
  const syncedIds = new Set();

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  try {
    console.log('Iniciando sincronización con Tokko...');

    do {
      console.log(`  Offset: ${offset}`);

      const response = await axios.get('https://www.tokkobroker.com/api/v1/property/search/', {
        params: {
          key: process.env.TOKKO_TOKEN,
          lang: 'es_ar',
          format: 'json',
          limit,
          offset,
          data: JSON.stringify({
            with_custom_tags: [],
            current_localization_id: 0,
            current_localization_type: 'country',
            price_from: 0,
            price_to: 999999999,
            operation_types: [1, 2, 3],
            property_types: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24],
            currency: 'ANY',
            filters: [],
            only_available: false,
            append_available: 'checked',
          }),
        },
      });

      const properties = response.data.objects.filter((p) => Number(p.status) !== 1);
      total_count = response.data.meta.total_count;
      console.log(`  ${properties.length} propiedades obtenidas de ${total_count}`);

      for (const property of properties) {
        syncedIds.add(property.id);

        const tokkoPhotos = await processPhotos(Array.isArray(property.photos) ? property.photos : [], property.id);

        // Preserve photos uploaded manually in the CRM (no original_url) — the sync only ever
        // owns the Tokko-sourced subset, otherwise every 6h cron run would wipe manual uploads.
        const existingDoc = await Property.findOne({ id: property.id }, { photos: 1 }).lean();
        const manualPhotos = (existingDoc?.photos || []).filter((p) => !p.original_url);
        const photos = [...tokkoPhotos, ...manualPhotos.map((p, i) => ({ ...p, order: tokkoPhotos.length + i }))];

        const operations = Array.isArray(property.operations)
          ? property.operations.map((op) => ({
              operation_id: op.operation_id ?? null,
              operation_type: op.operation_type || null,
              prices: (op.prices || []).map((p) => ({
                currency: p.currency,
                price: p.price || 0,
                period: p.period ?? '',
                period_number: p.period_number ?? null,
                is_promotional: p.is_promotional || false,
              })),
            }))
          : [];

        const statusNum = Number(property.status);
        const status = statusNum === 3 ? 'reservada' : statusNum === 4 ? 'vendida' : 'disponible';

        const existedBefore = !!existingDoc;

        const doc = await Property.findOneAndUpdate(
          { id: property.id },
          {
            $set: {
              ...property,
              photos,
              operations,
              status,
              description: property.description || '',
              rich_description: property.rich_description || '',
            },
          },
          { upsert: true, new: true }
        );

        if (!existedBefore) {
          Activity.create({
            type: 'property_created',
            description: `Nueva propiedad sincronizada: "${doc.publication_title || doc.address || doc.id}"`,
            entityId: String(doc.id),
            entityType: 'property',
            meta: { propertyId: doc.id },
          }).catch(console.error);
        }

        await delay(80);
      }

      offset += limit;
      await delay(600);
    } while (offset < total_count);

    await Property.deleteMany({ id: { $nin: Array.from(syncedIds) } });
    console.log('Sincronización completada.');
  } catch (error) {
    console.error('Error en sincronización con Tokko:', error);
  }
};
