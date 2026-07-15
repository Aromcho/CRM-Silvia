import { Router } from 'express';
import { syncToMercadoLibre, getMercadoLibreStatus, handleMercadoLibreLead } from '../../controllers/mercadolibre.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.post('/sync', isAuth, syncToMercadoLibre);
router.get('/status', isAuth, getMercadoLibreStatus);
router.post('/webhook/lead', handleMercadoLibreLead); // public webhook

export default router;
