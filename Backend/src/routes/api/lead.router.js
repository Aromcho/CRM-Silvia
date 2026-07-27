import { Router } from 'express';
import {
  getLeads, getLeadById, createLead, updateLead, updateLeadStatus, deleteLead, getLeadStats,
  getLeadEmailSetting, updateLeadEmailSetting,
} from '../../controllers/lead.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/', isAuth, getLeads);
router.get('/stats', isAuth, getLeadStats);
router.get('/email-setting', isAuth, getLeadEmailSetting);
router.patch('/email-setting', isAuth, updateLeadEmailSetting);
router.get('/:id', isAuth, getLeadById);
router.post('/', isAuth, createLead);
router.put('/:id', isAuth, updateLead);
router.patch('/:id/status', isAuth, updateLeadStatus);
router.delete('/:id', isAuth, deleteLead);

export default router;
