import { Schema, model } from 'mongoose';

const fileItemSchema = new Schema({
  type: { type: String, enum: ['foto', 'video', 'documento'], required: true },
  filename: String,
  url: String,
  size: Number,
  mimeType: String,
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  uploadedAt: { type: Date, default: Date.now },
});

const fileRecordSchema = new Schema(
  {
    title: { type: String, required: true },
    address: String,
    notes: String,
    status: { type: String, enum: ['pendiente', 'en_revision', 'lista'], default: 'pendiente', index: true },
    files: [fileItemSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

fileRecordSchema.index({ title: 'text', address: 'text', notes: 'text' });

export default model('FileRecord', fileRecordSchema);
