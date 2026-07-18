import jwt from 'jsonwebtoken';
import { createHash, verifyHash } from '../utils/hash.util.js';
import User from '../models/User.model.js';
import Activity from '../models/Activity.model.js';

function isHttps(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function tokenPayload(user) {
  return { id: user._id.toString(), email: user.email, role: user.role, name: user.name };
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email y contraseña requeridos' });

    const user = await User.findOne({ email, active: true });
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas' });

    const valid = await verifyHash(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Credenciales inválidas' });

    const token = jwt.sign(tokenPayload(user), process.env.SECRET_JWT, { expiresIn: '24h' });
    const secure = isHttps(req);
    res.cookie('jwt', token, { httpOnly: true, sameSite: secure ? 'none' : 'lax', secure, maxAge: 24 * 60 * 60 * 1000 });

    await Activity.create({ type: 'user_login', description: `${user.name} inició sesión`, userId: user._id, userName: user.name, userEmail: user.email, entityType: 'user' });

    return res.json({ online: true, token, user: tokenPayload(user) });
  } catch (error) {
    return next(error);
  }
}

export async function online(req, res) {
  try {
    const token = req.cookies?.jwt;
    if (!token) return res.json({ online: false });
    const decoded = jwt.verify(token, process.env.SECRET_JWT);
    const user = await User.findById(decoded.id).lean();
    if (!user) return res.json({ online: false });
    return res.json({ online: true, user: tokenPayload(user) });
  } catch {
    return res.json({ online: false });
  }
}

export async function logout(req, res) {
  const secure = isHttps(req);
  res.clearCookie('jwt', { httpOnly: true, sameSite: secure ? 'none' : 'lax', secure });
  return res.json({ message: 'Sesión cerrada' });
}

export async function register(req, res, next) {
  try {
    const { email, password, name, role = 'USER', phoneNumber } = req.body;
    if (!email || !password || !name) return res.status(400).json({ message: 'Faltan campos requeridos' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'El usuario ya existe' });

    const hashed = await createHash(password);
    const user = await User.create({ email, password: hashed, name, role, phoneNumber });
    const { password: _pw, ...safeUser } = user.toObject();
    return res.status(201).json(safeUser);
  } catch (error) {
    return next(error);
  }
}
