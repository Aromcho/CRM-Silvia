import { Router } from 'express';
import {
  getLeads, getLeadById, createLead, updateLead, updateLeadStatus, deleteLead, getLeadStats,
  getLeadEmailSetting, updateLeadEmailSetting,
} from '../../controllers/lead.controller.js';
import {
  getInbox, getPerson, contactPerson, addPersonNote, updatePerson, previewArchiveOld, archiveOld,
} from '../../controllers/leadInbox.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

// Bandeja agrupada por persona (C2). Van antes de /:id para que no se tomen como un id.
router.get('/inbox', isAuth, getInbox);
router.get('/archive-old', isAuth, previewArchiveOld);
router.post('/archive-old', isAuth, archiveOld);
router.get('/person/:key', isAuth, getPerson);
router.post('/person/:key/contact', isAuth, contactPerson);
router.post('/person/:key/note', isAuth, addPersonNote);
router.patch('/person/:key', isAuth, updatePerson);

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
