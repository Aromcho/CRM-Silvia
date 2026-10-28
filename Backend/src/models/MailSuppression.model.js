import { Schema, model } from 'mongoose';

// Emails que no vuelven a recibir Mail Marketing: bajas (link de desuscripción) y rebotes
// permanentes (5xx). Va por email y no por lead porque el mismo email aparece en varios leads.
// Solo aplica al Mail Marketing: no bloquea WhatsApp, contacto manual ni los avisos de leads.
const mailSuppressionSchema = new Schema(
  {
    email: { type: String, required: true, unique: true }, // normalizado: trim + minúsculas
    reason: { type: String, enum: ['unsubscribed', 'bounced'], required: true, index: true },
    detail: String, // respuesta SMTP del rebote
    campaign: { type: Schema.Types.ObjectId, ref: 'MailCampaign' },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default model('MailSuppression', mailSuppressionSchema);
