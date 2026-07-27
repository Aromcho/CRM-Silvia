import { Schema, model } from 'mongoose';

// Contadores atómicos para IDs propios del CRM (ej. propiedades cargadas a mano),
// separados del rango numérico que usa Tokko (hoy hasta ~8 dígitos).
const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true },
});

const Counter = model('Counter', counterSchema);

const MANUAL_PROPERTY_ID_BASE = 900000000; // 9 dígitos, muy por encima de cualquier ID real de Tokko

export async function nextManualPropertyId() {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'manual_property_id' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return MANUAL_PROPERTY_ID_BASE + counter.seq;
}

export default Counter;
