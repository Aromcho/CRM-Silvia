import mongoose from 'mongoose';
import User from './src/models/User.model.js';
import { createHash } from './src/utils/hash.util.js';

await mongoose.connect('mongodb://127.0.0.1:27017/crm_inmobiliaria');
const email = 'temp.qa.test@local.test';
await User.deleteOne({ email });
const hashed = await createHash('TempQA123!');
await User.create({ email, password: hashed, name: 'QA Temporal', role: 'ADMIN', active: true });
console.log('created', email);
await mongoose.disconnect();
