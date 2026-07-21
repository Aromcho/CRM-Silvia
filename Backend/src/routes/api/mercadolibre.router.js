import { Router } from 'express';
import {
  syncToMercadoLibre,
  syncAllMercadoLibre,
  getMercadoLibreStatus,
  handleMercadoLibreLead,
  connectMercadoLibre,
  oauthCallback,
} from '../../controllers/mercadolibre.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/oauth/connect', isAuth, connectMercadoLibre);
router.get('/oauth/callback', oauthCallback); // público: ML redirige acá sin cookies de sesión
router.post('/sync/:propertyId', isAuth, syncToMercadoLibre);
router.post('/sync-all', isAuth, syncAllMercadoLibre);
router.get('/status', isAuth, getMercadoLibreStatus);
router.post('/webhook/lead', handleMercadoLibreLead); // público

export default router;
