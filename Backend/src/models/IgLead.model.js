import { Schema, model } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

// Un documento por comentario de Instagram que matcheó una keyword. comment_id único = dedupe
// (Meta puede reenviar el mismo webhook varias veces).
const igLeadSchema = new Schema(
  {
    comment_id: { type: String, required: true, unique: true },
    parent_comment_id: String,
    ig_user_id: { type: String, index: true },
    ig_username: String,
    comment_text: String,
    keyword: String, // keyword que matcheó
    rule_key: { type: String, index: true }, // regla ('alquiler', 'info', ...)
    media_id: { type: String, index: true },
    media_product_type: String,
    permalink: String,
    property_id: { type: Number, index: true }, // Property.id del CRM (si el post está asociado)
    status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending', index: true },
    skip_reason: String,
    error: String, // último error de Meta (JSON)
    attempts: { type: Number, default: 0 },
    next_attempt_at: { type: Date, index: true },
    dm_text: String,
    dm_message_id: String,
    dm_sent_at: Date,
    public_reply_status: { type: String, enum: ['none', 'sent', 'failed'], default: 'none' },
    public_reply_text: String,
    public_reply_id: String,
    public_reply_error: String,
    comment_created_at: Date,
  },
  { timestamps: true }
);

igLeadSchema.plugin(mongoosePaginate);

export default model('IgLead', igLeadSchema);
