import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/crm_inmobiliaria');
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
  const email = '__verify_tmp@example.com';
  await User.deleteOne({ email });
  const hash = await bcrypt.hash('VerifyTmp123!', 10);
  await User.create({ email, password: hash, name: 'Verify Tmp', role: 'ADMIN', active: true });
  console.log('created', email);
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
