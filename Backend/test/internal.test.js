// node --test test/  — módulo /internal (panel central): fechas del contrato y candados de acceso
import { test } from 'node:test';
import assert from 'node:assert/strict';
import internalAuth from '../src/middlewares/internalAuth.mid.js';
import { addDays, baDay, baLocal, bump, emptySeries, parseLimit, parseRange, sortUpcoming, totalsOf } from '../src/utils/internal.util.js';

test('baDay / baLocal: el día es el de Buenos Aires, no el UTC', () => {
  // 23:30 del 19 en Buenos Aires ya es 20 en UTC
  const d = new Date('2026-11-20T02:30:00Z');
  assert.equal(baDay(d), '2026-11-19');
  assert.equal(baLocal(d), '2026-11-19T23:30');
  assert.equal(baDay(new Date('2026-11-20T03:00:00Z')), '2026-11-20');
});

test('parseRange: inclusive en los dos extremos, como texto y como Date', () => {
  const r = parseRange({ desde: '2026-11-01', hasta: '2026-11-19' });
  assert.equal(r.days, 19);
  assert.equal(r.hastaNext, '2026-11-20');
  assert.equal(r.from.toISOString(), '2026-11-01T03:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-11-20T03:00:00.000Z');
  // Fechas guardadas como texto: el último minuto del día entra, el día siguiente no
  assert.ok('2026-11-19T23:59' >= r.desde && '2026-11-19T23:59' < r.hastaNext);
  assert.ok(!('2026-11-20T00:00' < r.hastaNext));
});

test('parseRange: por defecto 30 días y rechaza fechas inválidas', () => {
  const r = parseRange({});
  assert.equal(r.days, 30);
  assert.equal(r.hasta, baDay(Date.now()));
  for (const q of [{ desde: 'ayer' }, { hasta: '2026-13-01' }, { desde: '2026-02-30' }, { desde: '2026-11-02', hasta: '2026-11-01' }, { desde: '2025-01-01', hasta: '2026-11-01' }]) {
    assert.throws(() => parseRange(q), (e) => e.status === 400, JSON.stringify(q));
  }
});

test('serie diaria: una fila por día, en cero, y lo que cae fuera del rango no suma', () => {
  const range = parseRange({ desde: '2026-02-27', hasta: '2026-03-02' });
  const series = emptySeries(range, ['leads', 'reservas']);
  assert.deepEqual([...series.keys()], ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  bump(series, '2026-02-28', 'leads');
  bump(series, '2026-02-28', 'leads', 2);
  bump(series, '2026-03-03', 'leads');
  assert.deepEqual(totalsOf(series, ['leads', 'reservas']), { leads: 3, reservas: 0 });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('parseLimit y orden de upcoming', () => {
  assert.equal(parseLimit({}), 20);
  assert.equal(parseLimit({ limite: '5' }), 5);
  assert.equal(parseLimit({ limite: '9999' }), 100);
  assert.equal(parseLimit({ limite: '-1' }), 20);
  const sorted = sortUpcoming([{ date: '2026-11-21T10:00' }, { date: '2026-11-01', pending: true }, { date: '2026-11-20' }]);
  assert.deepEqual(sorted.map((i) => i.date), ['2026-11-20', '2026-11-21T10:00', '2026-11-01']);
});

function call(headers, remoteAddress = '127.0.0.1') {
  const res = { code: 200, status(c) { this.code = c; return this; }, json() { return this; } };
  let passed = false;
  internalAuth({ headers, socket: { remoteAddress } }, res, () => { passed = true; });
  return passed ? 'next' : res.code;
}

test('internalAuth: token, localhost y nada reenviado por Nginx', () => {
  const before = process.env.INTERNAL_TOKEN;
  process.env.INTERNAL_TOKEN = 'secreto-de-prueba';
  const ok = { 'x-internal-token': 'secreto-de-prueba' };
  assert.equal(call(ok), 'next');
  assert.equal(call(ok, '::1'), 'next');
  assert.equal(call(ok, '::ffff:127.0.0.1'), 'next');
  assert.equal(call({}), 401);
  assert.equal(call({ 'x-internal-token': 'secreto-de-pruebaX' }), 401);
  assert.equal(call(ok, '190.2.3.4'), 404);
  assert.equal(call({ ...ok, 'x-forwarded-for': '190.2.3.4' }), 404);
  assert.equal(call({ ...ok, 'x-real-ip': '190.2.3.4' }), 404);
  delete process.env.INTERNAL_TOKEN;
  assert.equal(call(ok), 404);
  assert.equal(call({ 'x-internal-token': '' }), 404);
  if (before === undefined) delete process.env.INTERNAL_TOKEN; else process.env.INTERNAL_TOKEN = before;
});
