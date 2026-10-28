import { Schema, model } from 'mongoose';

// Documento único (_id fijo 'global') con flags de configuración general del CRM.
const settingsSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    leadEmailsEnabled: { type: Boolean, default: false },
    // Mail Marketing: ritmo del worker. Gmail permite ~500 destinatarios/24 h en una cuenta común;
    // se arranca más abajo y se sube desde la sección si no hay rebotes ni bloqueos.
    mailMarketing: {
      dailyLimit: { type: Number, default: 300 },
      minDelaySec: { type: Number, default: 20 },
      maxDelaySec: { type: Number, default: 40 },
      testEmail: String,
      replyTo: String,
    },
  },
  { timestamps: true }
);

export default model('Settings', settingsSchema);
