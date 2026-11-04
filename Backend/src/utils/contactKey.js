// Una persona = una clave. Las consultas de ML, ZonaProp, web y WhatsApp llegan sueltas (a veces
// solo teléfono, a veces solo email o el usuario del portal), así que se agrupan por el dato más
// confiable que tengan: teléfono (últimos 10 dígitos), si no email, si no nombre normalizado.

export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-10) : '';
}

export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contactKey(lead) {
  const phone = normalizePhone(lead?.phone);
  if (phone) return `t:${phone}`;
  const email = String(lead?.email || '').trim().toLowerCase();
  if (email) return `e:${email}`;
  const name = normalizeName(lead?.name);
  return name ? `n:${name}` : `id:${lead?._id}`;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function clip(text, max = 80) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
