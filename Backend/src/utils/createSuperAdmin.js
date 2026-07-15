import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import connectDB from './db.js';
import User from '../models/User.model.js';
import { createHash } from './hash.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function createSuperAdmin() {
  await connectDB();

  const email = 'barriosarom@gmail.com';
  const password = '26398322';
  const name = 'Aromcho';

  const exists = await User.findOne({ email });
  if (exists) {
    console.log(`El usuario ${email} ya existe (rol: ${exists.role})`);
    process.exit(0);
  }

  const hashed = await createHash(password);
  const user = await User.create({ email, password: hashed, name, role: 'SUPERADMIN', active: true });
  console.log(`SuperAdmin creado: ${user.email} (${user.name})`);
  process.exit(0);
}

createSuperAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
