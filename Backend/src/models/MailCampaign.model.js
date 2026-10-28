import { Schema, model } from 'mongoose';

// Campaña de Mail Marketing. Los destinatarios se congelan en MailSend al apretar "Enviar";
// hasta entonces solo se guardan los filtros y la vista previa se recalcula en cada consulta.
const eventSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
    message: String,
  },
  { _id: false }
);

const campaignSchema = new Schema(
  {
    name: { type: String, default: '' },
    subject: { type: String, default: '' },
    preheader: { type: String, default: '' }, // texto gris que muestran los clientes de mail junto al asunto
    fromName: { type: String, default: 'Silvia Fernández Propiedades' },
    html: { type: String, default: '' },
    // 'visual': el HTML sale del editor TipTap. 'html': se editó a mano y el editor visual no lo toca.
    editorMode: { type: String, enum: ['visual', 'html'], default: 'visual' },
    filters: {
      statuses: [String],
      sources: [String],
      dateFrom: String, // YYYY-MM-DD, hora Argentina
      dateTo: String,
      propertyIds: [Number],
      zones: [String], // Property.location.name de la propiedad consultada
    },
    // Emails @gmail.com.ar (casi seguro mal tipeados) que se excluyen por defecto; acá van los que se eligió incluir igual.
    includeEmails: [String],
    status: {
      type: String,
      enum: ['draft', 'sending', 'paused', 'finished', 'cancelled'],
      default: 'draft',
      index: true,
    },
    pauseReason: String,
    autoPaused: { type: Boolean, default: false }, // la pausó el worker (límite/bloqueo de Gmail), no el usuario
    waitingUntil: Date, // tope diario alcanzado: el worker retoma a esta hora
    stats: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
    events: [eventSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
    startedAt: Date,
    finishedAt: Date,
    lastTestAt: Date,
    lastTestTo: String,
  },
  { timestamps: true }
);

export default model('MailCampaign', campaignSchema);
