import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import mongoose from 'mongoose';
import Property from '../models/Property.model.js';
import PropertyDocument from '../models/PropertyDocument.model.js';
import Activity from '../models/Activity.model.js';

// Documentos de cada propiedad (C12). Privados: se guardan fuera de /uploads y se descargan solo
// con sesión; los marcados «solo admin» no los ve ni los baja un USER.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRIVATE_DIR = path.join(__dirname, '..', '..', 'private', 'properties');
const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|heic|docx?|xlsx?|odt|ods|txt|dwg|dxf|zip)$/i;
const KINDS = ['autorizacion', 'escritura', 'plano', 'tasacion', 'contrato', 'otro'];

const isAdminUser = (user) => user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
const pid = (req) => parseInt(req.params.id, 10);

function safeName(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(PRIVATE_DIR, String(pid(req)));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${Date.now()}_${safeName(file.originalname)}`),
});

export const uploadDocuments = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_EXT.test(file.originalname)),
});

function toClient(doc) {
  return {
    _id: doc._id, name: doc.name, kind: doc.kind, mime: doc.mime, size: doc.size,
    adminOnly: doc.adminOnly, uploadedBy: doc.uploadedBy, createdAt: doc.createdAt,
  };
}

// GET /properties/:id/documents
export async function listDocuments(req, res, next) {
  try {
    const filter = { propertyId: pid(req) };
    if (!isAdminUser(req.user)) filter.adminOnly = { $ne: true };
    const docs = await PropertyDocument.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ documents: docs.map(toClient), canSeeAdminOnly: isAdminUser(req.user) });
  } catch (error) {
    next(error);
  }
}

// POST /properties/:id/documents (multipart: files[], kind, adminOnly)
export async function addDocuments(req, res, next) {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'Subí PDF, imágenes, Word, Excel o planos (hasta 50 MB cada uno).' });
    const property = await Property.findOne({ id: pid(req) }, { id: 1, publication_title: 1, address: 1 }).lean();
    if (!property) {
      files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(404).json({ message: 'Propiedad no encontrada' });
    }
    const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'otro';
    const adminOnly = isAdminUser(req.user) && String(req.body?.adminOnly) === 'true';
    const created = await PropertyDocument.insertMany(files.map((f) => ({
      propertyId: property.id,
      name: path.parse(Buffer.from(f.originalname, 'latin1').toString('utf8')).name.slice(0, 140) || 'Documento',
      kind, filename: f.filename, mime: f.mimetype, size: f.size, adminOnly,
      uploadedBy: req.user?.name || '', uploadedById: String(req.user?.id || ''),
    })));
    await Activity.create({
      type: 'property_updated',
      description: `${req.user?.name || 'Alguien'} subió ${created.length} documento${created.length === 1 ? '' : 's'} a "${property.publication_title || property.address}"`,
      userId: req.user?.id, userName: req.user?.name, userEmail: req.user?.email,
      entityId: String(property.id), entityType: 'property',
      meta: { propertyId: property.id, documentsAdded: created.length },
    });
    res.status(201).json({ documents: created.map(toClient) });
  } catch (error) {
    next(error);
  }
}

async function findAllowed(req, res) {
  const doc = mongoose.isValidObjectId(req.params.docId)
    ? await PropertyDocument.findOne({ _id: req.params.docId, propertyId: pid(req) }).lean()
    : null;
  if (!doc || (doc.adminOnly && !isAdminUser(req.user))) {
    res.status(404).json({ message: 'Documento no encontrado' });
    return null;
  }
  return doc;
}

// GET /properties/:id/documents/:docId — descarga con sesión
export async function downloadDocument(req, res, next) {
  try {
    const doc = await findAllowed(req, res);
    if (!doc) return;
    const file = path.join(PRIVATE_DIR, String(doc.propertyId), path.basename(doc.filename));
    if (!fs.existsSync(file)) return res.status(410).json({ message: 'El archivo ya no está en el servidor' });
    const ext = path.extname(doc.filename);
    const inline = req.query.ver === '1' && /\.(pdf|jpe?g|png|webp)$/i.test(ext);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    const downloadName = `${safeName(doc.name)}${ext}`;
    if (inline) {
      res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
      return res.sendFile(file);
    }
    return res.download(file, downloadName);
  } catch (error) {
    next(error);
  }
}

// DELETE /properties/:id/documents/:docId — quien lo subió o un admin
export async function deleteDocument(req, res, next) {
  try {
    const doc = await findAllowed(req, res);
    if (!doc) return;
    if (!isAdminUser(req.user) && doc.uploadedById !== String(req.user?.id)) {
      return res.status(403).json({ message: 'Solo quien lo subió o un administrador puede borrarlo' });
    }
    await PropertyDocument.deleteOne({ _id: doc._id });
    fs.unlink(path.join(PRIVATE_DIR, String(doc.propertyId), path.basename(doc.filename)), () => {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}
