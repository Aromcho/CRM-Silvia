import jwt from 'jsonwebtoken';

export default function isAuth(req, res, next) {
  const token = req.cookies?.jwt;
  if (!token) return res.status(401).json({ message: 'No autenticado' });
  try {
    req.user = jwt.verify(token, process.env.SECRET_JWT);
    return next();
  } catch {
    return res.status(401).json({ message: 'Token inválido' });
  }
}
