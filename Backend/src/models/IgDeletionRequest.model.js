import { Schema, model } from 'mongoose';

// Pedidos de eliminación de datos recibidos por el Data Deletion Request Callback de Meta.
const igDeletionRequestSchema = new Schema(
  {
    confirmation_code: { type: String, required: true, unique: true },
    ig_user_id: String,
    status: { type: String, enum: ['received', 'completed', 'failed'], default: 'received' },
    deleted_leads: { type: Number, default: 0 },
    account_disconnected: { type: Boolean, default: false },
    error: String,
    completed_at: Date,
  },
  { timestamps: true }
);

export default model('IgDeletionRequest', igDeletionRequestSchema);
