import { Schema, model } from 'mongoose';

// Documento único (_id fijo 'global') con flags de configuración general del CRM.
const settingsSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    leadEmailsEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default model('Settings', settingsSchema);
