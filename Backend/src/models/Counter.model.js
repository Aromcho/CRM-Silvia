import Property from './Property.model.js';

// IDs propios del CRM (ej. propiedades cargadas a mano), separados del rango numérico que usa
// Tokko (hoy hasta ~8 dígitos). Antes era un contador secuencial (900000001, 900000002, ...);
// ahora se sortea dentro del mismo rango reservado y se verifica contra Property.id (único) para
// evitar la fila de ceros seguida de un número chico que quedaba muy visible en toda la UI.
const MANUAL_PROPERTY_ID_BASE = 900000000; // 9 dígitos, muy por encima de cualquier ID real de Tokko
const MANUAL_PROPERTY_ID_RANGE = 100000000; // [900000000, 999999999]
const MAX_ATTEMPTS = 10;

export async function nextManualPropertyId() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = MANUAL_PROPERTY_ID_BASE + Math.floor(Math.random() * MANUAL_PROPERTY_ID_RANGE);
    const taken = await Property.exists({ id: candidate });
    if (!taken) return candidate;
  }
  throw new Error(`No se pudo generar un ID de propiedad manual único después de ${MAX_ATTEMPTS} intentos.`);
}
