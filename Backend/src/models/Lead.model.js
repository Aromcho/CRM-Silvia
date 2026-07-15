import { Schema, model } from 'mongoose';

const leadSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
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
    status: {
      type: String,
      enum: ['nuevo', 'en_progreso', 'contactado', 'reservado', 'cerrado', 'descartado'],
      default: 'nuevo',
      index: true,
    },
    notes: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true }
);

leadSchema.index({ name: 'text', email: 'text', propertyTitle: 'text', message: 'text' });

export default model('Lead', leadSchema);
