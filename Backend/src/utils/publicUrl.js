// BACKEND_PUBLIC_URL: en el VPS apunta a https://apicrm.silviafernandezpropiedades.com.ar.
// Si no está seteado (local sin configurar) cae a localhost:PORT en vez de quedar vacío —
// local_image/local_original/local_thumb siempre tienen que ser una URL absoluta usable,
// nunca una ruta relativa sin dominio.
export function getBackendPublicUrl() {
  const configured = process.env.BACKEND_PUBLIC_URL;
  const base = configured || `http://localhost:${process.env.PORT || 7003}`;
  return base.replace(/\/$/, '');
}
