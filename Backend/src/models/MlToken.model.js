import { Schema, model } from 'mongoose';

// Documento único: credenciales OAuth de la cuenta de MercadoLibre conectada al CRM
const mlTokenSchema = new Schema(
  {
    access_token: { type: String, required: true },
    refresh_token: { type: String, required: true },
    ml_user_id: Number,
    expires_at: { type: Date, required: true },
  },
  { timestamps: true }
);

export default model('MlToken', mlTokenSchema);
