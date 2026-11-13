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
  getZonaPropReports,
} from '../../controllers/zonaprop.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';
import isAdmin from '../../middlewares/isAdmin.mid.js';

const router = Router();

router.post('/sync/:propertyId', isAuth, syncToZonaprop);
router.patch('/plan/:propertyId', isAuth, upgradeZonapropPlan);
// Acciones masivas o de configuración: solo administradores (C5)
router.post('/sync-all', isAuth, isAdmin, syncAllZonaprop);
router.get('/summary', isAuth, getZonaPropSummary);
router.get('/reports', isAuth, getZonaPropReports);
router.get('/summary/properties', isAuth, getZonaPropSummaryProperties);
router.post('/reconcile', isAuth, isAdmin, reconcileZonaprop);
router.get('/callbacks/config', isAuth, getZonapropCallbacksConfig);
router.post('/callbacks/configure', isAuth, isAdmin, configureZonapropCallbacks);
router.post('/webhook/callback', handleZonapropCallback); // público: Navent pega acá sin sesión
// ?sinceDays=N (default 2) — ventanas cortas mandan mail, backfills largos no (ver pollZonapropLeadsHandler)
router.post('/leads/poll', isAuth, isAdmin, pollZonapropLeadsHandler);

export default router;
