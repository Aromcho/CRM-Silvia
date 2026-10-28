// node --test test/  (o npm run test:instagram)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, containsKeyword, matchRule } from '../src/utils/instagramMatcher.js';
import { DEFAULT_RULES } from '../src/models/IgConfig.model.js';
import { buildDmText, propertyUrl } from '../src/utils/instagramProcessor.js';

test('normalizeText: minúsculas, sin tildes, emojis ni signos', () => {
  assert.equal(normalizeText('¡¡INFO!! 😍🏡'), 'info');
  assert.equal(normalizeText('Quiero  INFORMACIÓN, por favor...'), 'quiero informacion por favor');
  assert.equal(normalizeText('¿Fechas? 🙏 Año 2026'), 'fechas ano 2026');
  assert.equal(normalizeText('ALQUILER!!!'), 'alquiler');
  assert.equal(normalizeText('Pingüino'), 'pinguino');
  assert.equal(normalizeText('info@mail.com'), 'info mail com');
  assert.equal(normalizeText(''), '');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText('🔥🔥🔥'), '');
});

test('containsKeyword: palabra completa, no substring', () => {
  assert.ok(containsKeyword('me pasas info', 'info'));
  assert.ok(containsKeyword('info', 'INFO'));
  assert.ok(!containsKeyword('informe del barrio', 'info'));
  assert.ok(!containsKeyword('realquiler', 'alquiler'));
  assert.ok(containsKeyword('hay fechas libres', 'fechas'));
  assert.ok(containsKeyword('precio por favor', 'por favor'));
  assert.ok(!containsKeyword('algo', ''));
});

test('matchRule con las reglas por defecto', () => {
  const m = (t) => { const r = matchRule(t, DEFAULT_RULES); return r && `${r.rule.key}:${r.keyword}`; };
  assert.equal(m('Info 🙌'), 'info:info');
  assert.equal(m('INFO!!!'), 'info:info');
  assert.equal(m('¿Qué FECHAS tienen?'), 'alquiler:fechas');
  assert.equal(m('Alquiler 😍'), 'alquiler:alquiler');
  assert.equal(m('info del alquiler'), 'alquiler:alquiler'); // alquiler va primero: es más específica
  assert.equal(m('Hermosa casa 😍'), null);
  assert.equal(m('información'), null); // solo palabra exacta; se puede agregar "informacion" desde el panel
  assert.equal(m(''), null);
});

test('matchRule respeta reglas inactivas y keywords con tildes', () => {
  const rules = [
    { key: 'a', keywords: ['alquiler'], active: false },
    { key: 'b', keywords: ['Información', 'más info'], active: true },
  ];
  assert.equal(matchRule('alquiler', rules), null);
  assert.equal(matchRule('Quiero informacion!', rules).rule.key, 'b');
  assert.equal(matchRule('MAS INFO 🙏', rules).keyword, 'mas info');
});

test('buildDmText agrega el link de la ficha si hay propiedad', () => {
  assert.equal(buildDmText('Hola', null, '\n\nVer: {link}'), 'Hola');
  assert.equal(buildDmText('Hola', 123, '\n\nVer: {link}'), `Hola\n\nVer: ${propertyUrl(123)}`);
  assert.equal(buildDmText('Mirá {link} !', 7, 'x {link}'), `Mirá ${propertyUrl(7)} !`);
  assert.equal(buildDmText('Hola {link}', null, 'x'), 'Hola');
});
