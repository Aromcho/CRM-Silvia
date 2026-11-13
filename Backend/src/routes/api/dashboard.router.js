import { Router } from 'express';
import { getToday } from '../../controllers/dashboard.controller.js';
import { getFunnel } from '../../controllers/funnel.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/today', isAuth, getToday);
router.get('/funnel', isAuth, getFunnel);

export default router;
