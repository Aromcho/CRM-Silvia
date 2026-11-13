import { Schema, model } from 'mongoose';

// Numeradores correlativos (ej. 'recibo-reserva'). $inc atómico: dos recibos emitidos a la vez
// nunca comparten número.
const sequenceSchema = new Schema({
  _id: String,
  seq: { type: Number, default: 0 },
}, { versionKey: false });

const Sequence = model('Sequence', sequenceSchema);

export async function nextSequence(name, startAt = 1) {
  // Si no existe, arranca en startAt
  await Sequence.updateOne({ _id: name }, { $setOnInsert: { seq: startAt - 1 } }, { upsert: true });
  const doc = await Sequence.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true });
  return doc.seq;
}

export default Sequence;
