import { Router } from 'express';
import {
  syncToZonaprop,
  syncAllZonaprop,
  getZonaPropSummary,
  getZonaPropSummaryProperties,
  reconcileZonaprop,
  configureZonapropCallbacks,
  getZonapropCallbacksConfig,
  handleZonapropCallback,
} from '../../controllers/zonaprop.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.post('/sync/:propertyId', isAuth, syncToZonaprop);
router.post('/sync-all', isAuth, syncAllZonaprop);
router.get('/summary', isAuth, getZonaPropSummary);
router.get('/summary/properties', isAuth, getZonaPropSummaryProperties);
router.post('/reconcile', isAuth, reconcileZonaprop);
router.get('/callbacks/config', isAuth, getZonapropCallbacksConfig);
router.post('/callbacks/configure', isAuth, configureZonapropCallbacks);
router.post('/webhook/callback', handleZonapropCallback); // público: Navent pega acá sin sesión

export default router;
