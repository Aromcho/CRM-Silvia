import { Router } from 'express';
import {
  getConfig, updateConfig, getFilterOptions, previewAudience, searchProperties,
  listCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign, duplicateCampaign,
  previewCampaign, sendTest, startCampaign, pauseCampaign, resumeCampaign, cancelCampaign, listSends,
} from '../../controllers/mailMarketing.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';
import isSuperAdmin from '../../middlewares/isSuperAdmin.mid.js';

const router = Router();

// Panel "Mail Marketing": solo SUPERADMIN, el resto recibe 403. La baja pública está en publicMail.router.js
router.use(isAuth, isSuperAdmin);
router.get('/config', getConfig);
router.put('/config', updateConfig);
router.get('/filter-options', getFilterOptions);
router.post('/audience', previewAudience);
router.get('/properties', searchProperties);
router.get('/campaigns', listCampaigns);
router.post('/campaigns', createCampaign);
router.get('/campaigns/:id', getCampaign);
router.put('/campaigns/:id', updateCampaign);
router.delete('/campaigns/:id', deleteCampaign);
router.post('/campaigns/:id/duplicate', duplicateCampaign);
router.post('/campaigns/:id/preview', previewCampaign);
router.post('/campaigns/:id/test', sendTest);
router.post('/campaigns/:id/send', startCampaign);
router.post('/campaigns/:id/pause', pauseCampaign);
router.post('/campaigns/:id/resume', resumeCampaign);
router.post('/campaigns/:id/cancel', cancelCampaign);
router.get('/campaigns/:id/sends', listSends);

export default router;
