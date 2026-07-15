import { Schema, model } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    phoneNumber: String,
    photo: String,
    role: { type: String, default: 'USER', enum: ['USER', 'ADMIN', 'SUPERADMIN'], index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model('User', userSchema);
