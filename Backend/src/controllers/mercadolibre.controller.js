// LEER DOCUMENTACIÓN PARA LA INTEGRACIÓN
// https://developers.mercadolibre.com.ar/

export async function syncToMercadoLibre(req, res) {
  // TODO: Implementar sincronización con MercadoLibre
  // 1. Autenticación OAuth2 con MercadoLibre
  // 2. Mapear campos de Property al formato de ML
  // 3. POST /items para publicar o PUT /items/:id para actualizar
  res.status(501).json({ message: 'Integración con MercadoLibre pendiente de implementación' });
}

export async function getMercadoLibreStatus(req, res) {
  // TODO: Obtener estado de publicaciones en MercadoLibre
  res.status(501).json({ message: 'Integración con MercadoLibre pendiente de implementación' });
}

export async function handleMercadoLibreLead(req, res) {
  // TODO: Recibir leads desde webhook de MercadoLibre
  // Ver documentación: https://developers.mercadolibre.com.ar/es_ar/gestion-de-ventas
  res.status(501).json({ message: 'Webhook de MercadoLibre pendiente de implementación' });
}
