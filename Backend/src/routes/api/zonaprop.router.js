import { Router } from 'express';
import { syncToZonaprop, getZonapropStatus, handleZonapropLead, getZonaPropSummary } from '../../controllers/zonaprop.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.post('/sync', isAuth, syncToZonaprop);
router.get('/status', isAuth, getZonapropStatus);
router.get('/summary', isAuth, getZonaPropSummary);
router.post('/webhook/lead', handleZonapropLead); // public webhook

export default router;
