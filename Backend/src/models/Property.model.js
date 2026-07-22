import { Schema, model } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const operationSchema = new Schema({
  operation_id: Number,
  operation_type: { type: String, index: true },
  prices: [{
    currency: String,
    period: Schema.Types.Mixed, // Tokko envía 0 (venta/alquiler) o texto como "1st fortnight january" (temporario)
    period_number: Number, // quincena numérica, clave para matchear temporarios
    price: { type: Number, index: true },
    is_promotional: Boolean,
  }],
});

// Photos store both original Tokko URLs and local paths served by Express
const photoSchema = new Schema({
  description: String,
  is_blueprint: Boolean,
  is_front_cover: Boolean,
  order: Number,
  original_url: String,
  image_url: String,
  thumb_url: String,
  social_media_url: String,
  local_image: String,
  local_original: String,
  local_thumb: String,
});

const tagSchema = new Schema({ id: Number, name: { type: String, index: true }, type: Number });

const rentalBookingSchema = new Schema({
  startDate: Date,
  endDate: Date,
  guestName: String,
  guestPhone: String,
  notes: String,
  status: { type: String, enum: ['reservado', 'bloqueado'], default: 'reservado' },
});

const seasonRateSchema = new Schema({
  quincena: Number,
  semana: Number,
  dia: Number,
  currency: { type: String, default: 'USD' },
}, { _id: false });

const diciembreRateSchema = new Schema({
  quincena: Number,
  semana: Number,
  dia: Number,
  currency: { type: String, default: 'ARS' },
}, { _id: false });

const invernoRateSchema = new Schema({
  price: Number,
  currency: { type: String, default: 'ARS' },
}, { _id: false });

const seasonalRatesSchema = new Schema({
  invierno: { type: invernoRateSchema, default: undefined },
  diciembre: { type: diciembreRateSchema, default: undefined },
  enero: { type: seasonRateSchema, default: undefined },
  febrero: { type: seasonRateSchema, default: undefined },
  marzo: { type: seasonRateSchema, default: undefined },
}, { _id: false });

const temporaryRentalSchema = new Schema({
  alarmCode: String,
  ownerPhone: String,
  localidad: String,
  capacity: String,
  capacityGroup: { type: String, enum: ['1-4', '5-7', '8-12'], index: true },
  unitLabel: String,
  distMar: String,
  distCentro: String,
  mascotas: Boolean,
  lavarropas: Boolean,
  artPlaya: Boolean,
  escaleras: Boolean,
  cochera: Boolean,
  seasonalRates: seasonalRatesSchema,
  bookings: [rentalBookingSchema],
}, { _id: false });

const videoSchema = new Schema({
  description: String, id: Number, order: Number, player_url: String,
  provider: String, provider_id: Number, title: String, url: String, video_id: String,
});

// Dueño/contacto de la propiedad tal como lo entrega Tokko en internal_data.property_owners
const propertyOwnerSchema = new Schema({
  id: Number,
  name: String,
  birthdate: Date,
  cellphone: String,
  document_number: String,
  email: String,
  other_email: String,
  other_phone: String,
  phone: String,
  work_email: String,
  created_at: Date,
  updated_at: Date,
});

const internalDataSchema = new Schema({
  commission: String,
  cotization_users: Array,
  internal_comments: String,
  key_location: String,
  legally_checked: Number,
  legally_checked_text: String,
  maintenance_user: String,
  network_information: String,
  producer_comision: String,
  property_owners: [propertyOwnerSchema],
  transaction_requirements: String,
}, { _id: false });

const extraAttributeSchema = new Schema({
  is_expenditure: Boolean,
  is_measure: Boolean,
  name: String,
  value: String,
}, { _id: false });

const propertySchema = new Schema({
  id: { type: Number, required: true, unique: true, index: true },
  address: { type: String, text: true },
  address_complement: String,
  age: { type: Number, index: true },
  apartment_door: String,
  appartments_per_floor: Number,
  bathroom_amount: { type: Number, index: true },
  block_number: String,
  branch: {
    address: String, alternative_phone: String, alternative_phone_area: String,
    alternative_phone_country_code: String, alternative_phone_extension: String,
    branch_type: String, contact_time: String, created_date: Date,
    display_name: String, email: String, geo_lat: Number, geo_long: Number,
    gm_location_type: String, id: { type: Number, index: true }, is_default: Boolean,
    logo: String, name: { type: String, index: true }, pdf_footer_text: String,
    phone: String, phone_area: String, phone_country_code: String,
    phone_extension: String, use_pdf_footer: Boolean,
  },
  building: String,
  cleaning_tax: String,
  common_area: String,
  covered_parking_lot: Number,
  created_at: Date,
  credit_eligible: { type: String, index: true },
  custom1: String,
  custom_tags: [tagSchema],
  deleted_at: Date,
  depth_measure: String,
  description: { type: String, text: true },
  development: Schema.Types.Mixed,
  development_excel_extra_data: String,
  dining_room: Number,
  disposition: String,
  down_payment: String,
  expenses: Number,
  extra_attributes: [extraAttributeSchema],
  fake_address: String,
  files: Array,
  fire_insurance_cost: String,
  floor: String,
  floors_amount: Number,
  front_measure: String,
  geo_lat: { type: Number, index: true },
  geo_long: { type: Number, index: true },
  gm_location_type: String,
  guests_amount: Number,
  has_temporary_rent: Boolean,
  internal_data: internalDataSchema,
  iptu: Number,
  iptu_type: String,
  is_denounced: Boolean,
  is_starred_on_web: Boolean,
  legally_checked: String,
  livable_area: String,
  living_amount: Number,
  location: {
    divisions: { type: Array, index: true },
    full_location: { type: String, text: true },
    id: Number,
    name: { type: String, index: true },
    parent_division: String,
    short_location: String,
    state: String,
    weight: Number,
    zip_code: String,
  },
  location_level: Schema.Types.Mixed,
  lot_number: String,
  occupation: Array,
  operations: [operationSchema],
  orientation: String,
  parking_lot_amount: { type: Number, index: true },
  parking_lot_condition: Schema.Types.Mixed,
  parking_lot_type: Schema.Types.Mixed,
  photos: [photoSchema],
  portal_footer: String,
  private_area: String,
  producer: {
    cellphone: String, email: String, id: Number,
    name: { type: String, text: true }, phone: String, picture: String, position: String,
  },
  property_condition: { type: String, text: true },
  public_url: String,
  publication_title: { type: String, text: true },
  quality_level: Schema.Types.Mixed,
  real_address: { type: String, text: true },
  reference_code: String,
  rich_description: String,
  roofed_surface: String,
  room_amount: { type: Number, index: true },
  semiroofed_surface: String,
  seo_description: String,
  seo_keywords: String,
  situation: String,
  status: { type: String, enum: ['disponible', 'reservada', 'vendida', 'en_tasacion', 'no_disponible'], default: 'disponible', index: true },
  suite_amount: { type: Number, index: true },
  suites_with_closets: Number,
  surface: String,
  surface_measurement: String,
  tags: [tagSchema],
  toilet_amount: Number,
  total_area: String,
  total_suites: Number,
  total_surface: { type: String, index: true },
  transaction_requirements: String,
  tv_rooms: Number,
  type: { code: String, id: Number, name: { type: String, index: true } },
  uncovered_parking_lot: Number,
  unroofed_surface: String,
  videos: [videoSchema],
  web_price: Boolean,
  zonification: String,
  // CRM-specific fields
  is_manual: { type: Boolean, default: false },
  notes: String,
  lastEditedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastEditedAt: Date,
  // Checklist de "Servicios, ambientes y adicionales" editado a mano en el CRM — a propósito
  // NO es `tags`/`custom_tags` (esos los pisa syncWithTokko.js con el spread de Tokko en cada
  // corrida, cada 2 min). Una vez que se toca este checklist, es la única fuente de verdad para esa UI.
  manual_tags: { type: [String], default: undefined },
  temporaryRental: temporaryRentalSchema,
  difusion: {
    mercadolibre: {
      // Agregado calculado a partir de `listings` (hay hasta 2: venta y alquiler pueden convivir en la misma propiedad)
      published: { type: Boolean, default: false },
      url: { type: String, default: '' },
      updated_at: Date,
      last_error: String,
      listings: [{
        operation_type: { type: String, index: true }, // 'venta' | 'alquiler'
        item_id: String,
        category_id: String,
        url: String,
        status: { type: String, enum: ['active', 'paused', 'closed'], default: 'active' },
        last_error: String,
        updated_at: Date,
        listing_type_id: String, // 'silver' | 'gold' | 'gold_premium' (Plata/Oro-Destacado/Oro Premium-Superdestacado)
        health_percentage: Number, // 0-100, calidad de la publicación según ML
        health_actions: [String], // recomendaciones en texto plano para mejorar la calidad
        health_checked_at: Date,
      }],
    },
    zonaprop: {
      published: { type: Boolean, default: false },
      url: { type: String, default: '' },
      updated_at: Date,
    },
  },
}, { timestamps: true });

propertySchema.plugin(mongoosePaginate);

propertySchema.index({
  address: 'text',
  'location.full_location': 'text',
  'location.name': 'text',
  'type.name': 'text',
  'producer.name': 'text',
  publication_title: 'text',
  real_address: 'text',
  description: 'text',
});

propertySchema.index({
  'operations.operation_type': 1,
  'type.name': 1,
  'operations.prices.price': 1,
  room_amount: 1,
  bathroom_amount: 1,
  status: 1,
});

export default model('Property', propertySchema);
