export default function isSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'SUPERADMIN') {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de super administrador.' });
  }
  return next();
}
