export default function isAdmin(req, res, next) {
  if (!req.user || !['ADMIN', 'SUPERADMIN'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  return next();
}
