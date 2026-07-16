export const STATUS_LABELS = {
  disponible: 'Disponible',
  reservada: 'Reservada',
  vendida: 'Vendida',
  en_tasacion: 'En tasación',
  no_disponible: 'No disponible',
};

export const LEAD_STATUS_LABELS = {
  nuevo: 'Nuevo',
  en_progreso: 'En progreso',
  contactado: 'Contactado',
  reservado: 'Reservado',
  cerrado: 'Cerrado',
  descartado: 'Descartado',
};

export const OPERATION_TYPE_LABELS = {
  Venta: 'Venta',
  Alquiler: 'Alquiler',
  'Alquiler temporal': 'Temporal',
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:7003';

export function photoSrc(photo) {
  if (!photo) return null;
  if (photo.local_image) return photo.local_image.startsWith('http') ? photo.local_image : `${API_BASE}${photo.local_image}`;
  if (photo.image_url) return photo.image_url;
  if (photo.image) return photo.image;
  return null;
}

export function formatPrice(ops) {
  if (!ops || !ops.length) return null;
  const op = ops[0];
  if (!op.prices || !op.prices.length) return null;
  const p = op.prices[0];
  if (!p.price) return null;
  const formatted = new Intl.NumberFormat('es-AR').format(p.price);
  return `${p.currency === 'USD' ? 'USD' : '$'} ${formatted}`;
}
