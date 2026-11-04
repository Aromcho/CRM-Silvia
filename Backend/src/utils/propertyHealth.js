// Dónde está publicada cada propiedad y qué le falta (C3 lista, C4 ficha). Un solo lugar para
// las reglas, así la lista, la ficha y el inicio dicen lo mismo.

const WEB_HIDDEN = ['en_tasacion', 'no_disponible'];
const ML_PLAN = { silver: 'Plata', gold: 'Oro', gold_special: 'Oro', gold_premium: 'Oro Premium', gold_pro: 'Oro Pro', free: 'Gratis' };
const ZP_PLAN = { SIMPLE: 'Simple', DESTACADO: 'Destacado', HOME: 'Home', SUPERDESTACADO: 'Superdestacado' };

const stripHtml = (v) => String(v || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function operationKinds(p) {
  const kinds = new Set();
  (p.operations || []).forEach((op) => {
    const t = String(op?.operation_type || '').toLowerCase();
    if (t.includes('tempor')) kinds.add('temporario');
    else if (t.includes('alquiler') || t === 'rent') kinds.add('alquiler');
    else if (t.includes('venta') || t === 'sale') kinds.add('venta');
  });
  return [...kinds];
}

export function channelsOf(p) {
  const web = { on: !WEB_HIDDEN.includes(p.status) };

  const mlDoc = p.difusion?.mercadolibre || {};
  const listings = Array.isArray(mlDoc.listings) ? mlDoc.listings : [];
  const active = listings.find((l) => l.status === 'active');
  const errored = listings.find((l) => l.last_error) || (mlDoc.last_error ? { last_error: mlDoc.last_error } : null);
  let ml;
  if (errored && !active) ml = { state: 'error', label: 'con error', detail: stripHtml(errored.last_error).slice(0, 160) };
  else if (active) ml = { state: 'on', label: ML_PLAN[active.listing_type_id] || 'activo', plan: active.listing_type_id || '', url: active.url || mlDoc.url || '', health: active.health_percentage ?? null };
  else if (listings.some((l) => l.status === 'paused')) ml = { state: 'paused', label: 'pausado' };
  else if (listings.some((l) => l.status === 'under_review')) ml = { state: 'review', label: 'en revisión' };
  else ml = { state: 'off', label: 'sin publicar' };

  const zpDoc = p.difusion?.zonaprop || {};
  const zpError = zpDoc.errors?.[0]?.message || zpDoc.last_error || (zpDoc.estado === 'ERROR' ? 'ZonaProp rechazó el aviso' : '');
  let zp;
  if (zpError && !zpDoc.published) zp = { state: 'error', label: 'con error', detail: stripHtml(zpError).slice(0, 160) };
  else if (zpDoc.published && zpDoc.estado === 'PENDIENTE') zp = { state: 'review', label: 'pendiente' };
  else if (zpDoc.published) {
    const plan = String(zpDoc.tipoDePublicacion || 'SIMPLE').toUpperCase().replace(/_COMBO.*$/, '');
    zp = { state: 'on', label: ZP_PLAN[plan] || 'Simple', plan, url: zpDoc.url || '', health: zpDoc.calidad_percentage ?? null };
  } else zp = { state: 'off', label: 'sin publicar' };

  return { web, ml, zp };
}

// Lo que le falta a la ficha para estar completa. Cada ítem tiene una clave para filtrar.
export function healthOf(p) {
  const kinds = operationKinds(p);
  const photos = Array.isArray(p.photos) ? p.photos.length : 0;
  const description = stripHtml(p.description || p.rich_description || '');
  const checks = [
    { key: 'photos', label: 'Fotos', ok: photos >= 5, missing: photos ? `Solo ${photos} foto${photos === 1 ? '' : 's'}` : 'Sin fotos' },
    { key: 'title', label: 'Título', ok: Boolean(stripHtml(p.publication_title)), missing: 'Sin título' },
    { key: 'description', label: 'Descripción', ok: description.length >= 80, missing: description ? 'Descripción muy corta' : 'Sin descripción' },
    { key: 'map', label: 'Mapa', ok: Number.isFinite(Number(p.geo_lat)) && Number(p.geo_lat) !== 0 && Number.isFinite(Number(p.geo_long)) && Number(p.geo_long) !== 0, missing: 'Sin ubicación en el mapa' },
    { key: 'video', label: 'Video', ok: Array.isArray(p.videos) && p.videos.length > 0, missing: 'Falta video' },
  ];
  const isLand = /terreno|lote/i.test(p.type?.name || '');
  if (!isLand && (kinds.includes('temporario') || kinds.includes('alquiler'))) {
    checks.push({ key: 'sea', label: 'Distancia al mar', ok: Boolean(String(p.distanciaMar || '').trim()), missing: 'Sin distancia al mar' });
  }
  const done = checks.filter((c) => c.ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter((c) => !c.ok).map((c) => ({ key: c.key, label: c.missing })),
    checks: checks.map(({ key, label, ok }) => ({ key, label, ok })),
  };
}

export function summarize(p) {
  return { kinds: operationKinds(p), channels: channelsOf(p), health: healthOf(p) };
}
