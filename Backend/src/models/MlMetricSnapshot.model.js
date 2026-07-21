import { Schema, model } from 'mongoose';

// Una fila por publicación de ML por día — visitas/preguntas no tienen endpoint de serie histórica
// a nivel item en la API de ML, así que el CRM arma su propia serie acumulando snapshots diarios.
const mlMetricSnapshotSchema = new Schema(
  {
    propertyId: { type: Number, required: true, index: true },
    operationType: { type: String, required: true }, // 'venta' | 'alquiler'
    itemId: { type: String, required: true },
    date: { type: Date, required: true }, // día (medianoche) al que corresponde el snapshot
    visits: { type: Number, default: 0 },
    questions: { type: Number, default: 0 },
    phoneViews: { type: Number, default: 0 },
    whatsapp: { type: Number, default: 0 },
    leadsByType: {
      whatsapp: { type: Number, default: 0 },
      question: { type: Number, default: 0 },
      call: { type: Number, default: 0 },
      schedule: { type: Number, default: 0 },
      quotation: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

mlMetricSnapshotSchema.index({ itemId: 1, date: 1 }, { unique: true });

export default model('MlMetricSnapshot', mlMetricSnapshotSchema);
