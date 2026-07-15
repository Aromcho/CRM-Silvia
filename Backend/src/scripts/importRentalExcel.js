import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../utils/db.js';
import { importRentalExcelFile, RENTAL_XLSX_PATH } from '../utils/rentalExcelImporter.js';

dotenv.config();

async function run() {
  const xlsxPath = process.argv[2] || RENTAL_XLSX_PATH;
  console.log('Leyendo', xlsxPath);

  await connectDB();
  const summary = await importRentalExcelFile(xlsxPath);

  console.log(`\nBloques de propiedad encontrados en hojas de capacidad: ${summary.blocksFound}`);
  console.log(`Filas en "Hoja 4" (ficha de propiedades): ${summary.factsFound}`);
  console.log(`\nPropiedades actualizadas: ${summary.updated}`);
  console.log(`IDs duplicados detectados: ${summary.duplicateIds}`);
  console.log(`Bloques sin ID numerico (placeholder "ID" o vacio): ${summary.unmatchedIds.length}`);
  if (summary.unmatchedIds.length) console.log('  ->', summary.unmatchedIds.join(', '));
  console.log(`Filas de "Hoja 4" sin bloque de capacidad correspondiente: ${summary.unmatchedFacts.length}`);
  if (summary.unmatchedFacts.length) console.log('  ->', summary.unmatchedFacts.join(', '));

  await mongoose.disconnect();
  console.log('\nListo.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
