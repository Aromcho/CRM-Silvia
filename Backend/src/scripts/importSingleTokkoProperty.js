import dotenv from 'dotenv';
import axios from 'axios';
import mongoose from 'mongoose';
import connectDB from '../utils/db.js';
import { upsertPropertyFromTokko } from '../utils/syncWithTokko.js';

dotenv.config();

// Trae UNA sola propiedad de Tokko por id y la upsertea en el CRM, sin tocar ninguna otra
// (a diferencia de `npm run sync`, que reemplaza el listado completo y borra las que Tokko
// ya no devuelve).
async function fetchTokkoProperty(propertyId) {
  const { data } = await axios.get(`https://www.tokkobroker.com/api/v1/property/${propertyId}/`, {
    params: { key: process.env.TOKKO_TOKEN, lang: 'es_ar', format: 'json' },
  });
  // El endpoint de detalle devuelve el objeto directo; por las dudas, contemplamos también
  // la forma paginada (`{ objects: [...] }`) que usa el endpoint de búsqueda.
  return Array.isArray(data?.objects) ? data.objects[0] : data;
}

async function run() {
  const propertyId = Number(process.argv[2]);
  if (!propertyId) {
    console.error('Uso: node src/scripts/importSingleTokkoProperty.js <id_de_tokko>');
    process.exit(1);
  }

  await connectDB();

  console.log(`Buscando propiedad ${propertyId} en Tokko...`);
  const property = await fetchTokkoProperty(propertyId);

  if (!property || !property.id) {
    console.error(`No se encontró la propiedad ${propertyId} en Tokko (o la respuesta vino vacía).`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const { doc, existedBefore } = await upsertPropertyFromTokko(property);

  console.log(
    `Propiedad ${doc.id} ${existedBefore ? 'actualizada' : 'creada'} en el CRM: "${doc.publication_title || doc.address}"`
  );

  await mongoose.disconnect();
  console.log('Listo.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
