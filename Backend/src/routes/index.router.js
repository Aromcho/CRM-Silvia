import { Router } from 'express';
import sessionRouter from './api/session.router.js';
import userRouter from './api/user.router.js';
import propertyRouter from './api/property.router.js';
import leadRouter from './api/lead.router.js';
import activityRouter from './api/activity.router.js';
import mercadolibreRouter from './api/mercadolibre.router.js';
import zonapropRouter from './api/zonaprop.router.js';
import fileRecordRouter from './api/fileRecord.router.js';

const router = Router();

router.use('/sessions', sessionRouter);
router.use('/users', userRouter);
router.use('/properties', propertyRouter);
router.use('/leads', leadRouter);
router.use('/activities', activityRouter);
router.use('/mercadolibre', mercadolibreRouter);
router.use('/zonaprop', zonapropRouter);
router.use('/files', fileRecordRouter);

export default router;
