import mongoose from 'mongoose';

export default async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm_inmobiliaria';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB conectado');
}
