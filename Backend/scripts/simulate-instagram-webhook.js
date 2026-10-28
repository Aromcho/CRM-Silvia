// Simula webhooks de Instagram firmados contra el backend y verifica procesamiento, dedupe y lead guardado.
//   node scripts/simulate-instagram-webhook.js [baseUrl] [--keep]
// baseUrl por defecto: http://localhost:7003 (usar https://crm.silviafernandezpropiedades.com.ar para
// probar a través de Nginx). Con la automatización APAGADA el lead queda en "skipped" y no se llama a Meta.
// Borra lo que crea salvo que se pase --keep.
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../src/utils/db.js';
import IgLead from '../src/models/IgLead.model.js';
import IgMediaMap from '../src/models/IgMediaMap.model.js';
import Property from '../src/models/Property.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const BASE = (args.find((a) => !a.startsWith('--')) || 'http://localhost:7003').replace(/\/$/, '');
const HOOK = `${BASE}/api/instagram/webhook`;
const SECRET = process.env.IG_APP_SECRET;
const RUN = `simtest_${Date.now()}`;

let failures = 0;
function check(cond, label, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures += 1;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function commentPayload({ commentId, text, fromId, username, mediaId, entryId = '17841400000000000' }) {
  return {
    object: 'instagram',
    entry: [{
      id: entryId,
      time: Math.floor(Date.now() / 1000),
      changes: [{
        field: 'comments',
        value: { from: { id: fromId, username }, media: { id: mediaId, media_product_type: 'FEED' }, id: commentId, text },
      }],
    }],
  };
}

async function post(payload, { badSignature = false } = {}) {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', badSignature ? 'otro-secreto' : SECRET).update(raw).digest('hex');
  return fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': `sha256=${sig}` }, body: raw });
}

async function waitLead(commentId, ms = 4000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const lead = await IgLead.findOne({ comment_id: commentId }).lean();
    if (lead && lead.status !== 'pending') return lead;
    await sleep(200);
  }
  return IgLead.findOne({ comment_id: commentId }).lean();
}

async function main() {
  if (!SECRET) throw new Error('Falta IG_APP_SECRET en .env');
  await connectDB();
  console.log(`Webhook: ${HOOK}\n`);

  // 1. Verificación GET
  const challenge = String(Math.floor(Math.random() * 1e9));
  let r = await fetch(`${HOOK}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(process.env.WEBHOOK_VERIFY_TOKEN)}&hub.challenge=${challenge}`);
  check(r.status === 200 && (await r.text()) === challenge, 'GET de verificación devuelve el challenge');
  r = await fetch(`${HOOK}?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=1`);
  check(r.status === 403, 'GET con verify_token incorrecto → 403', String(r.status));

  // 2. Firma inválida
  const property = await Property.findOne({}, { id: 1 }).sort({ updatedAt: -1 }).lean();
  const mediaId = `${RUN}_media`;
  if (property) await IgMediaMap.create({ media_id: mediaId, property_id: property.id, permalink: 'https://www.instagram.com/p/SIMTEST/' });

  const payload1 = commentPayload({ commentId: `${RUN}_c1`, text: '¡¡INFO!! 😍', fromId: `${RUN}_user`, username: 'usuario_de_prueba', mediaId });
  r = await post(payload1, { badSignature: true });
  check(r.status === 403, 'POST con firma inválida → 403', String(r.status));
  await sleep(500);
  check(!(await IgLead.exists({ comment_id: `${RUN}_c1` })), 'POST con firma inválida no crea lead');

  // 3. Comentario con keyword → lead
  const t0 = Date.now();
  r = await post(payload1);
  check(r.status === 200, 'POST firmado → 200', `${r.status} en ${Date.now() - t0} ms`);
  const lead = await waitLead(`${RUN}_c1`);
  check(!!lead, 'Lead guardado');
  if (lead) {
    check(lead.rule_key === 'info' && lead.keyword === 'info', 'Keyword "info" matcheada', `${lead.rule_key}/${lead.keyword}`);
    check(lead.ig_username === 'usuario_de_prueba' && lead.media_id === mediaId, 'Usuario y media guardados');
    console.log(`  estado: ${lead.status}${lead.skip_reason ? ` (${lead.skip_reason})` : ''}${lead.error ? ` error: ${lead.error}` : ''}`);
    if (property) {
      check(lead.property_id === property.id, 'Lead vinculado a la propiedad del post', `#${lead.property_id}`);
      check(String(lead.dm_text).includes(`/propiedad/${property.id}`), 'El DM incluye el link a la ficha');
    }
  }

  // 4. Dedupe: mismo comment_id reenviado (Meta reintenta webhooks)
  r = await post(payload1);
  check(r.status === 200, 'Reenvío del mismo webhook → 200');
  await sleep(1000);
  const count = await IgLead.countDocuments({ comment_id: `${RUN}_c1` });
  check(count === 1, 'Dedupe por comment_id: sigue habiendo 1 lead', String(count));

  // 5. Keyword de alquiler
  await post(commentPayload({ commentId: `${RUN}_c2`, text: '¿Qué FECHAS tienen libres? 🏖️', fromId: `${RUN}_user2`, username: 'otro_usuario', mediaId: `${RUN}_media2` }));
  const lead2 = await waitLead(`${RUN}_c2`);
  check(lead2?.rule_key === 'alquiler', 'Comentario "fechas" → regla alquiler', lead2?.rule_key);

  // 6. Comentario propio (from.id = cuenta) → ignorado
  await post(commentPayload({ commentId: `${RUN}_c3`, text: 'info', fromId: '17841400000000000', username: 'cuenta_propia', mediaId }));
  // 7. Sin keyword → ignorado
  await post(commentPayload({ commentId: `${RUN}_c4`, text: 'Hermosa casa 😍', fromId: `${RUN}_user3`, username: 'tercero', mediaId }));
  await sleep(1500);
  check(!(await IgLead.exists({ comment_id: `${RUN}_c3` })), 'Comentario de la propia cuenta ignorado');
  check(!(await IgLead.exists({ comment_id: `${RUN}_c4` })), 'Comentario sin keyword ignorado');

  if (!KEEP) {
    await IgLead.deleteMany({ comment_id: { $regex: `^${RUN}_` } });
    await IgMediaMap.deleteMany({ media_id: { $regex: `^${RUN}_` } });
    console.log('\n(datos de prueba borrados)');
  }
  console.log(failures ? `\n${failures} verificaciones fallaron` : '\nTodo OK');
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
