export default function errorHandler(err, req, res, _next) {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Error interno del servidor' });
}
