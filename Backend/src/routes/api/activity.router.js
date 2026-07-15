import { Router } from 'express';
import { getActivities } from '../../controllers/activity.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/', isAuth, getActivities);

export default router;
