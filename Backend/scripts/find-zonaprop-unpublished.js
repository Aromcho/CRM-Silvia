// Uso: node scripts/find-zonaprop-unpublished.js  (correr desde Backend/, con el MONGO_URI del entorno que quieras auditar)
// Lista propiedades elegibles para ZonaProp (status disponible/reservada) que no están publicadas,
// separando por motivo: nunca sincronizadas vs. sincronizadas pero con error.
import 'dotenv/config';
import mongoose from 'mongoose';
import Property from '../src/models/Property.model.js';

const ZP_ELIGIBLE_STATUSES = ['disponible', 'reservada'];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const eligible = await Property.find({ status: { $in: ZP_ELIGIBLE_STATUSES } })
    .select('id address publication_title type status difusion.zonaprop')
    .lean();

  const unpublished = eligible.filter((p) => !p.difusion?.zonaprop?.published);

  const neverSynced = unpublished.filter((p) => !p.difusion?.zonaprop?.codigoAviso && !p.difusion?.zonaprop?.last_error);
  const withError = unpublished.filter((p) => p.difusion?.zonaprop?.last_error);
  const other = unpublished.filter((p) => !neverSynced.includes(p) && !withError.includes(p));

  console.log(`Total elegibles (disponible/reservada): ${eligible.length}`);
  console.log(`Publicadas: ${eligible.length - unpublished.length}`);
  console.log(`No publicadas: ${unpublished.length}\n`);

  if (neverSynced.length) {
    console.log(`--- Nunca sincronizadas (${neverSynced.length}) ---`);
    for (const p of neverSynced) {
      console.log(`id=${p.id} tipo="${p.type?.name || ''}" dir="${p.address || ''}" titulo="${p.publication_title || ''}"`);
    }
    console.log();
  }

  if (withError.length) {
    console.log(`--- Con error (${withError.length}) ---`);
    for (const p of withError) {
      console.log(`id=${p.id} dir="${p.address || ''}" titulo="${p.publication_title || ''}" error="${p.difusion.zonaprop.last_error}"`);
    }
    console.log();
  }

  if (other.length) {
    console.log(`--- Otro motivo (sin error registrado, sin published) (${other.length}) ---`);
    for (const p of other) {
      console.log(`id=${p.id} dir="${p.address || ''}" titulo="${p.publication_title || ''}" estado_zp=${JSON.stringify(p.difusion?.zonaprop || {})}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
