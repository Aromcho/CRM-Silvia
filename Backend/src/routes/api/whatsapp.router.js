import { Router } from 'express';
import { getWhatsAppStats } from '../../controllers/whatsapp.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/stats', isAuth, getWhatsAppStats);

export default router;
