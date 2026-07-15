// LEER DOCUMENTACIÓN PARA LA INTEGRACIÓN
// https://developers.zonaprop.com.ar/

export async function syncToZonaprop(req, res) {
  // TODO: Implementar sincronización con ZonaProp
  // 1. Autenticación con API Key de ZonaProp
  // 2. Mapear campos de Property al formato de ZonaProp
  // 3. Crear o actualizar avisos vía la API REST
  res.status(501).json({ message: 'Integración con ZonaProp pendiente de implementación' });
}

export async function getZonapropStatus(req, res) {
  // TODO: Obtener estado de avisos en ZonaProp
  res.status(501).json({ message: 'Integración con ZonaProp pendiente de implementación' });
}

export async function handleZonapropLead(req, res) {
  // TODO: Recibir leads desde webhook de ZonaProp
  // Ver documentación de la API para webhooks/notificaciones
  res.status(501).json({ message: 'Webhook de ZonaProp pendiente de implementación' });
}
