import { Router } from 'express';
import {
  syncToZonaprop,
  upgradeZonapropPlan,
  syncAllZonaprop,
  getZonaPropSummary,
  getZonaPropSummaryProperties,
  reconcileZonaprop,
  configureZonapropCallbacks,
  getZonapropCallbacksConfig,
  handleZonapropCallback,
  pollZonapropLeadsHandler,
} from '../../controllers/zonaprop.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.post('/sync/:propertyId', isAuth, syncToZonaprop);
router.patch('/plan/:propertyId', isAuth, upgradeZonapropPlan);
router.post('/sync-all', isAuth, syncAllZonaprop);
router.get('/summary', isAuth, getZonaPropSummary);
router.get('/summary/properties', isAuth, getZonaPropSummaryProperties);
router.post('/reconcile', isAuth, reconcileZonaprop);
router.get('/callbacks/config', isAuth, getZonapropCallbacksConfig);
router.post('/callbacks/configure', isAuth, configureZonapropCallbacks);
router.post('/webhook/callback', handleZonapropCallback); // público: Navent pega acá sin sesión
// ?sinceDays=N (default 2) — ventanas cortas mandan mail, backfills largos no (ver pollZonapropLeadsHandler)
router.post('/leads/poll', isAuth, pollZonapropLeadsHandler);

export default router;
