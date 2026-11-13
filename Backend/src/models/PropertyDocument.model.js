import { Schema, model } from 'mongoose';

// Documentos de una propiedad (C12): autorización, escritura, planos, etc. El archivo vive en
// Backend/private/properties/:id/ (nunca en /uploads, que es público) y se baja con sesión.
// adminOnly: solo lo ven ADMIN y SUPERADMIN.
const propertyDocumentSchema = new Schema(
  {
    propertyId: { type: Number, required: true, index: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['autorizacion', 'escritura', 'plano', 'tasacion', 'contrato', 'otro'], default: 'otro' },
    filename: { type: String, required: true },
    mime: String,
    size: Number,
    adminOnly: { type: Boolean, default: false },
    uploadedBy: String,
    uploadedById: String,
  },
  { timestamps: true }
);

export default model('PropertyDocument', propertyDocumentSchema);
