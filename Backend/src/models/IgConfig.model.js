import { Schema, model } from 'mongoose';

// Documento único (_id fijo 'global') con la configuración de la automatización comentario → DM.
// Las reglas se evalúan en orden: gana la primera cuya keyword aparezca en el comentario.
const ruleSchema = new Schema({
  key: { type: String, required: true }, // identificador estable ('alquiler', 'info', ...)
  label: String,
  keywords: [String],
  message: String,
  active: { type: Boolean, default: true },
}, { _id: false });

export const DEFAULT_RULES = [
  {
    key: 'alquiler',
    label: 'Alquileres',
    keywords: ['alquiler', 'fechas'],
    message: 'COMPLETAR: ¡Hola! Gracias por tu consulta sobre alquileres. Escribile a nuestros asesores de alquiler:\n- COMPLETAR nombre: COMPLETAR WhatsApp\n- COMPLETAR nombre: COMPLETAR WhatsApp',
    active: true,
  },
  {
    key: 'info',
    label: 'Información general',
    keywords: ['info'],
    message: 'COMPLETAR: ¡Hola! Gracias por tu comentario. Estos son los contactos de nuestros asesores:\n- COMPLETAR nombre: COMPLETAR WhatsApp\n- COMPLETAR nombre: COMPLETAR WhatsApp',
    active: true,
  },
];

export const DEFAULT_PUBLIC_REPLIES = [
  '¡Te escribimos por mensaje privado! 📩',
  '¡Gracias! Te mandamos la info por DM 🙌',
  '¡Listo! Revisá tus mensajes directos 😊',
];

const igConfigSchema = new Schema(
  {
    _id: { type: String, default: 'global' },
    enabled: { type: Boolean, default: false }, // interruptor general: arranca APAGADO
    rules: { type: [ruleSchema], default: () => DEFAULT_RULES },
    // Texto que se agrega al DM cuando el post está asociado a una propiedad. {link} = ficha en la web.
    propertyLinkTemplate: { type: String, default: '\n\nMirá la propiedad acá: {link}' },
    // Contacto que se agrega primero en la lista de asesores cuando el post es de una propiedad en venta.
    saleContactLine: { type: String, default: 'Silvia: +54 9 225550-9408' },
    publicReplyEnabled: { type: Boolean, default: false },
    publicReplies: { type: [String], default: () => DEFAULT_PUBLIC_REPLIES },
    publicReplyIndex: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default model('IgConfig', igConfigSchema);
