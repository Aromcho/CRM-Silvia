import User from '../models/User.model.js';
import { createHash } from '../utils/hash.util.js';

export async function getUsers(req, res, next) {
  try {
    const users = await User.find({}, { password: 0 }).lean();
    res.json(users);
  } catch (error) {
    next(error);
  }
}

// Lista corta de asesores (solo nombre e id) para asignar consultas. Cualquier usuario logueado
// la puede pedir: antes /users era solo para admins y a un usuario común la lista le salía vacía.
export async function getAgents(req, res, next) {
  try {
    const users = await User.find({ active: { $ne: false } }, { name: 1, email: 1 }).sort({ name: 1 }).lean();
    res.json(users.map((u) => ({ _id: u._id, name: u.name })));
  } catch (error) {
    next(error);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id, { password: 0 }).lean();
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { name, phoneNumber, photo, role, active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (phoneNumber !== undefined) update.phoneNumber = phoneNumber;
    if (photo !== undefined) update.photo = photo;
    if (role !== undefined) update.role = role;
    if (active !== undefined) update.active = active;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, select: '-password' });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req, res, next) {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    const hashed = await createHash(password);
    await User.findByIdAndUpdate(req.params.id, { password: hashed });
    res.json({ message: 'Contraseña actualizada' });
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req, res, next) {
  try {
    await User.findByIdAndUpdate(req.params.id, { active: false });
    res.json({ message: 'Usuario desactivado' });
  } catch (error) {
    next(error);
  }
}
