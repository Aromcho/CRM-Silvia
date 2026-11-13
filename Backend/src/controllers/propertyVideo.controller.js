import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import Property from '../models/Property.model.js';
import Activity from '../models/Activity.model.js';
import IgMediaMap from '../models/IgMediaMap.model.js';
import { getBackendPublicUrl } from '../utils/publicUrl.js';
import { propertyActivitySnapshot, triggerPortalsSync } from './property.controller.js';

// Videos de cualquier fuente (X7): link de YouTube, reel de Instagram o MP4 subido. Se cargan una
// vez acá y aparecen en la ficha de la web, la videoteca (/videos) y el link corto (/v/:id).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'properties');

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const INSTAGRAM_RE = /instagram\.com\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;
const MP4_RE = /^https?:\/\/\S+\.(mp4|m4v|webm|mov)(\?\S*)?$/i;

export function parseVideoUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  const yt = url.match(YOUTUBE_RE);
  if (yt) {
    return { provider: 'youtube', video_id: yt[1], url: `https://www.youtube.com/watch?v=${yt[1]}`, player_url: `https://www.youtube.com/embed/${yt[1]}`, thumbnail: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  }
  const ig = url.match(INSTAGRAM_RE);
  if (ig) {
    const kind = ig[1] === 'reels' ? 'reel' : ig[1];
    return { provider: 'instagram', url: `https://www.instagram.com/${kind}/${ig[2]}/`, player_url: `https://www.instagram.com/${kind}/${ig[2]}/embed` };
  }
  if (MP4_RE.test(url)) return { provider: 'mp4', url, player_url: url };
  return null;
}

function sameVideo(a, b) {
  if (a.video_id && b.video_id) return a.video_id === b.video_id;
  if (a.ig_media_id && b.ig_media_id) return a.ig_media_id === b.ig_media_id;
  return String(a.url || '').replace(/\/$/, '') === String(b.url || '').replace(/\/$/, '');
}

async function pushVideo(property, video, user) {
  if ((property.videos || []).some((v) => sameVideo(v, video))) return false;
  property.videos.push({ ...video, order: property.videos.length, addedBy: user?.name || '', addedAt: new Date() });
  if (user?.id) {
    property.lastEditedBy = user.id;
    property.lastEditedAt = new Date();
  }
  await property.save();
  return true;
}

async function logVideo(property, user, text) {
  await Activity.create({
    type: 'property_updated',
    description: `${user?.name || 'Sistema'} ${text} en "${property.publication_title || property.address}"`,
    userId: user?.id, userName: user?.name || 'Sistema', userEmail: user?.email,
    entityId: String(property.id), entityType: 'property',
    meta: { propertyId: property.id, ...propertyActivitySnapshot(property), changes: [{ path: 'videos', label: 'Videos', from: '', to: text }] },
  });
}

// POST /properties/:id/videos/link { url, title }
export async function addVideoLink(req, res, next) {
  try {
    const parsed = parseVideoUrl(req.body?.url);
    if (!parsed) return res.status(400).json({ message: 'Pegá un link de YouTube, un reel de Instagram o un link a un .mp4' });
    const property = await Property.findOne({ id: parseInt(req.params.id, 10) });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });
    const title = String(req.body?.title || '').trim().slice(0, 120);
    const added = await pushVideo(property, { ...parsed, title }, req.user);
    if (!added) return res.status(409).json({ message: 'Ese video ya está cargado en esta propiedad' });
    await logVideo(property, req.user, `agregó un video de ${parsed.provider === 'youtube' ? 'YouTube' : parsed.provider === 'instagram' ? 'Instagram' : 'MP4'}`);
    if (parsed.provider === 'youtube') triggerPortalsSync(property);
    res.status(201).json(property);
  } catch (error) {
    next(error);
  }
}

const videoStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOADS_DIR, String(parseInt(req.params.id, 10)), 'videos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.mp4').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `video_${Date.now()}${ext}`);
  },
});

export const uploadVideoFile = multer({
  storage: videoStorage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^video\//.test(file.mimetype) && /\.(mp4|m4v|webm|mov)$/i.test(file.originalname)),
});

// POST /properties/:id/videos/upload (multipart, campo "video")
export async function addVideoFile(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'Subí un video MP4, MOV o WEBM (hasta 300 MB)' });
    const property = await Property.findOne({ id: parseInt(req.params.id, 10) });
    if (!property) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ message: 'Propiedad no encontrada' });
    }
    const url = `${getBackendPublicUrl()}/uploads/properties/${property.id}/videos/${req.file.filename}`;
    const title = String(req.body?.title || path.parse(req.file.originalname).name).trim().slice(0, 120);
    await pushVideo(property, { provider: 'mp4', url, player_url: url, title }, req.user);
    await logVideo(property, req.user, 'subió un video');
    res.status(201).json(property);
  } catch (error) {
    next(error);
  }
}

// DELETE /properties/:id/videos/:videoId — si era un MP4 subido, se borra también el archivo
export async function deleteVideo(req, res, next) {
  try {
    const property = await Property.findOne({ id: parseInt(req.params.id, 10) });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });
    const video = property.videos.id(req.params.videoId);
    if (!video) return res.status(404).json({ message: 'Video no encontrado' });
    const wasYoutube = video.provider === 'youtube' || (!video.provider && video.video_id);
    const localPrefix = `${getBackendPublicUrl()}/uploads/properties/${property.id}/videos/`;
    if (video.provider === 'mp4' && String(video.url).startsWith(localPrefix)) {
      const file = path.join(UPLOADS_DIR, String(property.id), 'videos', path.basename(video.url));
      fs.unlink(file, () => {});
    }
    video.deleteOne();
    property.lastEditedBy = req.user.id;
    property.lastEditedAt = new Date();
    await property.save();
    await logVideo(property, req.user, 'quitó un video');
    if (wasYoutube) triggerPortalsSync(property);
    res.json(property);
  } catch (error) {
    next(error);
  }
}

// Los reels que la automatización de Instagram ya vinculó a una propiedad se suman solos a sus
// videos. Se llama al vincular un post y una vez al arrancar para los vinculados antes.
export async function addInstagramReelToProperty(map) {
  if (!map?.property_id || !map.permalink) return false;
  const type = String(map.media_product_type || '').toUpperCase();
  if (type && type !== 'REELS' && type !== 'VIDEO') return false;
  const parsed = parseVideoUrl(map.permalink);
  if (!parsed || parsed.provider !== 'instagram') return false;
  const property = await Property.findOne({ id: map.property_id });
  if (!property) return false;
  return pushVideo(property, {
    ...parsed,
    ig_media_id: map.media_id,
    thumbnail: map.thumbnail_url || '',
    title: String(map.caption || '').split('\n')[0].slice(0, 120),
  }, { name: 'Instagram' });
}

export async function syncLinkedInstagramReels() {
  try {
    const maps = await IgMediaMap.find({ property_id: { $ne: null }, permalink: { $exists: true, $ne: '' } }).lean();
    let added = 0;
    for (const map of maps) {
      // eslint-disable-next-line no-await-in-loop
      if (await addInstagramReelToProperty(map)) added += 1;
    }
    if (added) console.log(`[videos] ${added} reels de Instagram sumados a sus propiedades`);
    return added;
  } catch (err) {
    console.error('[videos] No se pudieron sumar los reels de Instagram:', err.message);
    return 0;
  }
}
