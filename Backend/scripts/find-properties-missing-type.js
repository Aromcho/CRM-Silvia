// Uso: node src/scripts/find-properties-missing-type.js  (correr desde Backend/, con el MONGO_URI del entorno que quieras auditar)
// Lista propiedades manuales sin tipo y/o sin operación cargada (invisibles en la web por el filtro de tipo/operación).
import 'dotenv/config';
import mongoose from 'mongoose';
import Property from '../src/models/Property.model.js';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const missing = await Property.find({
    $or: [
      { 'type.name': { $in: [null, ''] } },
      { operations: { $size: 0 } },
    ],
  })
    .select('id address publication_title type operations is_manual createdAt')
    .sort({ createdAt: -1 })
    .lean();

  console.log(`Encontradas ${missing.length} propiedades con tipo y/o operación faltante:\n`);
  for (const p of missing) {
    console.log(
      `id=${p.id} manual=${!!p.is_manual} tipo="${p.type?.name || ''}" operaciones=${p.operations?.length || 0} creada=${p.createdAt?.toISOString?.() || ''} dir="${p.address}" titulo="${p.publication_title || ''}"`
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
