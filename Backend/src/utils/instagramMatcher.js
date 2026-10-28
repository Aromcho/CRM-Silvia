// Normalización y matcheo de keywords de comentarios de Instagram. Sin dependencias para poder
// testearlo aislado (scripts/testInstagramMatcher.js).

// Minúsculas, sin tildes/diéresis (ñ → n), sin emojis ni signos; espacios colapsados.
export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Una keyword matchea como palabra completa ("info" no matchea "informe"); si tiene varias palabras,
// como frase completa.
export function containsKeyword(normalizedText, keyword) {
  const kw = normalizeText(keyword);
  if (!kw) return false;
  return ` ${normalizedText} `.includes(` ${kw} `);
}

// Devuelve { rule, keyword } con la primera regla activa (en orden) que matchea, o null.
export function matchRule(text, rules) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  for (const rule of rules || []) {
    if (rule.active === false) continue;
    const keyword = (rule.keywords || []).find((kw) => containsKeyword(normalized, kw));
    if (keyword) return { rule, keyword: normalizeText(keyword) };
  }
  return null;
}
