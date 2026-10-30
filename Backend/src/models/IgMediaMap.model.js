import { Schema, model } from 'mongoose';

// Asociación post/reel de Instagram → propiedad del CRM (Property.id).
const igMediaMapSchema = new Schema(
  {
    media_id: { type: String, required: true, unique: true },
    property_id: { type: Number, index: true },
    // Mensaje propio de este post: si está cargado reemplaza al mensaje de la regla (el link a la ficha se agrega igual)
    custom_message: String,
    permalink: String,
    caption: String,
    thumbnail_url: String,
    media_product_type: String,
  },
  { timestamps: true }
);

export default model('IgMediaMap', igMediaMapSchema);
