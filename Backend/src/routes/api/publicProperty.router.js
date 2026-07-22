import { Router } from 'express';
import { getPublicProperties, getPublicPropertyIds } from '../../controllers/publicProperty.controller.js';
import apiKey from '../../middlewares/apiKey.mid.js';

const router = Router();

router.get('/', apiKey, getPublicProperties);
router.get('/ids', apiKey, getPublicPropertyIds);

export default router;
