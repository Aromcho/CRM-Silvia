import { Router } from 'express';
import { login, logout, online, register } from '../../controllers/session.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';
import isSuperAdmin from '../../middlewares/isSuperAdmin.mid.js';

const router = Router();

router.post('/login', login);
router.get('/online', online);
router.delete('/logout', logout);
router.post('/register', isAuth, isSuperAdmin, register);

export default router;
