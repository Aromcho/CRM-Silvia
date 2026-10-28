import { Schema, model } from 'mongoose';

// Documento único (_id fijo 'main'): cuenta de Instagram profesional conectada vía
// "Instagram API con inicio de sesión con Instagram" y su token de larga duración.
const igAccountSchema = new Schema(
  {
    _id: { type: String, default: 'main' },
    access_token: { type: String, required: true },
    ig_user_id: { type: String, index: true }, // `user_id` de /me: es el `entry.id` de los webhooks
    app_scoped_id: String, // `id` de /me (app-scoped); el OAuth devuelve este en `user_id`
    username: String,
    account_type: String,
    permissions: [String],
    token_issued_at: Date,
    expires_at: { type: Date, required: true },
    last_refresh_at: Date,
    last_refresh_error: String,
    webhook_subscribed: { type: Boolean, default: false },
    subscribed_fields: [String],
    subscribe_error: String,
    connected_at: Date,
    connected_by: String,
  },
  { timestamps: true }
);

export default model('IgAccount', igAccountSchema);
