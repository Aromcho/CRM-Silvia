import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import FileRecord from '../models/FileRecord.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'files');

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
    cb(null, `${Date.now()}_${safeFilename(file.originalname)}`);
  },
});

export const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

export async function getFileRecords(req, res, next) {
  try {
    const { status, searchQuery, limit = 50, offset = 0 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (searchQuery) {
      const q = searchQuery.trim();
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } },
        { notes: { $regex: q, $options: 'i' } },
      ];
    }

    const [records, total] = await Promise.all([
      FileRecord.find(filter).sort({ createdAt: -1 }).skip(parseInt(offset, 10)).limit(parseInt(limit, 10)).lean(),
      FileRecord.countDocuments(filter),
    ]);

    res.json({ meta: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) }, objects: records });
  } catch (error) {
    next(error);
  }
}

export async function getFileRecordById(req, res, next) {
  try {
    const record = await FileRecord.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ message: 'Registro no encontrado' });
    res.json(record);
  } catch (error) {
    next(error);
  }
}

export async function createFileRecord(req, res, next) {
  try {
    const { title, address, notes } = req.body;
    if (!title) return res.status(400).json({ message: 'El título es requerido' });
    const record = await FileRecord.create({ title, address, notes, createdBy: req.user.id });
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
}

export async function updateFileRecord(req, res, next) {
  try {
    const updates = {};
    for (const key of ['title', 'address', 'notes', 'status']) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const record = await FileRecord.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!record) return res.status(404).json({ message: 'Registro no encontrado' });
    res.json(record);
  } catch (error) {
    next(error);
  }
}

export async function deleteFileRecord(req, res, next) {
  try {
    const record = await FileRecord.findByIdAndDelete(req.params.id);
    if (record) {
      const dir = path.join(UPLOADS_DIR, String(record._id));
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    res.json({ message: 'Registro eliminado' });
  } catch (error) {
    next(error);
  }
}

export async function uploadFiles(req, res, next) {
  try {
    const { type } = req.body;
    if (!['foto', 'video', 'documento'].includes(type)) return res.status(400).json({ message: 'Tipo de archivo inválido' });

    const record = await FileRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Registro no encontrado' });

    const entries = (req.files || []).map((file) => ({
      type,
      filename: file.originalname,
      url: `/uploads/files/${record._id}/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
      uploadedBy: req.user.id,
    }));

    record.files.push(...entries);
    await record.save();

    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
}

export async function deleteFile(req, res, next) {
  try {
    const record = await FileRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Registro no encontrado' });

    const file = record.files.id(req.params.fileId);
    if (!file) return res.status(404).json({ message: 'Archivo no encontrado' });

    const filePath = path.join(UPLOADS_DIR, String(record._id), path.basename(file.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    record.files.pull(req.params.fileId);
    await record.save();

    res.json(record);
  } catch (error) {
    next(error);
  }
}
