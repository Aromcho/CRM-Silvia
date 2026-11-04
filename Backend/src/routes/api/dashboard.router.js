import { Router } from 'express';
import { getToday } from '../../controllers/dashboard.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/today', isAuth, getToday);

export default router;
