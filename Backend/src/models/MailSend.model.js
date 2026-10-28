import { Schema, model } from 'mongoose';

// Un documento por destinatario de cada campaña (y por cada "Enviar prueba"): es la cola del worker
// y a la vez el log de envíos. También sirve para contar el cupo diario de Gmail (últimas 24 h).
const mailSendSchema = new Schema(
  {
    campaign: { type: Schema.Types.ObjectId, ref: 'MailCampaign', index: true },
    isTest: { type: Boolean, default: false },
    email: { type: String, required: true }, // normalizado: trim + minúsculas
    lead: { type: Schema.Types.ObjectId, ref: 'Lead' }, // lead más reciente con ese email
    name: String,
    propertyTitle: String,
    status: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: Date,
    lastAttemptAt: { type: Date, index: true },
    sentAt: Date,
    messageId: String,
    error: String,
    errorCode: String, // código SMTP (550, 421…) o de nodemailer (ECONNECTION…)
    skipReason: String,
  },
  { timestamps: true }
);

mailSendSchema.index({ campaign: 1, status: 1, createdAt: 1 });
mailSendSchema.index({ campaign: 1, email: 1 }, { unique: true, partialFilterExpression: { isTest: false } });

export default model('MailSend', mailSendSchema);
