import { Router } from 'express';
import { getUsers, getUser, updateUser, changePassword, deleteUser } from '../../controllers/user.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';
import isAdmin from '../../middlewares/isAdmin.mid.js';

const router = Router();

router.get('/', isAuth, isAdmin, getUsers);
router.get('/:id', isAuth, getUser);
router.put('/:id', isAuth, updateUser);
router.put('/:id/password', isAuth, isAdmin, changePassword);
router.delete('/:id', isAuth, isAdmin, deleteUser);

export default router;
