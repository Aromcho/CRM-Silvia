import { Router } from 'express';
import { getUsers, getAgents, getUser, updateUser, changePassword, deleteUser } from '../../controllers/user.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';
import isAdmin from '../../middlewares/isAdmin.mid.js';
import isSuperAdmin from '../../middlewares/isSuperAdmin.mid.js';

const router = Router();

router.get('/', isAuth, isAdmin, getUsers);
router.get('/agents', isAuth, getAgents);
router.get('/:id', isAuth, getUser);
router.put('/:id', isAuth, isSuperAdmin, updateUser);
router.put('/:id/password', isAuth, isSuperAdmin, changePassword);
router.delete('/:id', isAuth, isSuperAdmin, deleteUser);

export default router;
