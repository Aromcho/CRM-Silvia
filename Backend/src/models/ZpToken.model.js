import { Schema, model } from 'mongoose';

// Documento único: access_token OAuth2 client_credentials de la cuenta ZonaProp/Navent conectada al CRM
const zpTokenSchema = new Schema(
  {
    access_token: { type: String, required: true },
    token_type: String,
    scope: String,
    expires_at: { type: Date, required: true },
  },
  { timestamps: true }
);

export default model('ZpToken', zpTokenSchema);
