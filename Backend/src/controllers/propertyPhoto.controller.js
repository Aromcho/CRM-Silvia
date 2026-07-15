import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import Property from '../models/Property.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'properties');

function safeFilename(str) {
  return String(str).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOADS_DIR, String(req.params.id));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `manual_${Date.now()}_${safeFilename(file.originalname)}`);
  },
});

export const uploadPhotos = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

export async function addPhotos(req, res, next) {
  try {
    const property = await Property.findOne({ id: parseInt(req.params.id, 10) });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    const startOrder = property.photos.length;
    const entries = (req.files || []).map((file, i) => {
      const url = `/uploads/properties/${property.id}/${file.filename}`;
      return {
        description: '', is_blueprint: false, is_front_cover: false,
        order: startOrder + i,
        original_url: '', image_url: '', thumb_url: '', social_media_url: '',
        local_image: url, local_original: url, local_thumb: url,
      };
    });

    property.photos.push(...entries);
    property.lastEditedBy = req.user.id;
    property.lastEditedAt = new Date();
    await property.save();
    res.status(201).json(property);
  } catch (error) {
    next(error);
  }
}

export async function deletePhoto(req, res, next) {
  try {
    const property = await Property.findOne({ id: parseInt(req.params.id, 10) });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    const photo = property.photos.id(req.params.photoId);
    if (!photo) return res.status(404).json({ message: 'Foto no encontrada' });

    if (photo.local_image) {
      const filePath = path.join(UPLOADS_DIR, String(property.id), path.basename(photo.local_image));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    photo.deleteOne();
    property.lastEditedBy = req.user.id;
    property.lastEditedAt = new Date();
    await property.save();
    res.json(property);
  } catch (error) {
    next(error);
  }
}

export async function reorderPhotos(req, res, next) {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ message: 'order debe ser un array de IDs de foto' });

    const property = await Property.findOne({ id: parseInt(req.params.id, 10) });
    if (!property) return res.status(404).json({ message: 'Propiedad no encontrada' });

    const byId = new Map(property.photos.map((p) => [String(p._id), p]));
    order.forEach((id, i) => {
      const p = byId.get(String(id));
      if (p) p.order = i;
    });
    property.photos.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    property.lastEditedBy = req.user.id;
    property.lastEditedAt = new Date();
    await property.save();
    res.json(property);
  } catch (error) {
    next(error);
  }
}
