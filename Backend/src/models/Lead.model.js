import { Schema, model } from 'mongoose';
import { contactKey } from '../utils/contactKey.js';

const leadSchema = new Schema(
  {
    name: { type: String, required: true },
    // No es obligatorio: MercadoLibre y ZonaProp muchas veces mandan el contacto sin email (solo
    // teléfono o usuario del portal). Con `required` esas consultas fallaban al guardarse y se perdían.
    email: { type: String, default: '' },
    phone: String,
    message: String,
    propertyId: { type: Number, index: true },
    propertyTitle: String,
    source: {
      type: String,
      enum: ['manual', 'mercadolibre', 'zonaprop', 'web', 'whatsapp', 'otro'],
      default: 'manual',
      index: true,
    },
    // 'historico': consultas viejas que nadie movió, pasadas de una vez desde Consultas para que
    // la bandeja muestre lo que hay que atender hoy. No se borran y se pueden reabrir.
    status: {
      type: String,
      enum: ['nuevo', 'en_progreso', 'contactado', 'reservado', 'cerrado', 'descartado', 'historico'],
      default: 'nuevo',
      index: true,
    },
    notes: String,
    // Clave de la persona (utils/contactKey.js) para agrupar todas sus consultas en una fila
    contactKey: { type: String, index: true },
    // Cada toque de WhatsApp / Llamar / Email desde el CRM: quién y cuándo
    contactLog: [{
      channel: { type: String, enum: ['whatsapp', 'llamada', 'email', 'portal', 'nota'] },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      userName: String,
      text: String,
      at: { type: Date, default: Date.now },
    }],
    lastContactAt: Date,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    // Id del contacto en el sistema de origen (ej. "zp-321431843") — para no duplicar leads cuando
    // el polling de ZonaProp vuelve a consultar un rango de fechas que ya se procesó antes.
    externalId: { type: String, index: true, sparse: true },
    // Fecha en que se dio de baja del Mail Marketing (link del mail). Solo frena los mails masivos:
    // WhatsApp, llamados y mails manuales siguen igual. El registro de bajas vive en MailSuppression.
    emailOptOut: Date,
  },
  { timestamps: true }
);

leadSchema.index({ name: 'text', email: 'text', propertyTitle: 'text', message: 'text' });

// La clave de persona se calcula sola al crear o editar (incluye ML, ZonaProp, web e Instagram)
leadSchema.pre('save', function setContactKey(next) {
  if (this.isNew || this.isModified('phone') || this.isModified('email') || this.isModified('name')) {
    this.contactKey = contactKey(this);
  }
  next();
});

export default model('Lead', leadSchema);
