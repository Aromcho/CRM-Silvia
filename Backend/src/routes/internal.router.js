import express from 'express';
import { health, metrics, upcoming } from '../controllers/internal.controller.js';
import internalAuth from '../middlewares/internalAuth.mid.js';

// Módulo /internal: lo consulta solo el panel central (admin-api) desde el mismo servidor.
// Contrato y cómo sumar un proyecto: README del repo panel-dios.
const router = express.Router();

router.use(internalAuth);
router.get('/health', health);
router.get('/metrics', metrics);
router.get('/upcoming', upcoming);

// Errores del módulo: siempre JSON con su código (un rango de fechas inválido es un 400)
// eslint-disable-next-line no-unused-vars
router.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error('[internal]', error);
  res.status(status).json({ message: status >= 500 ? 'Internal error' : error.message });
});

export default router;
