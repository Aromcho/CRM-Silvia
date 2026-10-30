import express, { Router } from 'express';
import {
  verifyWebhook,
  receiveWebhook,
  connect,
  oauthCallback,
  dataDeletionCallback,
  dataDeletionStatus,
  getStatus,
  disconnect,
  refreshToken,
  subscribe,
  getConfigHandler,
  updateConfig,
  listLeads,
  retryLead,
  deleteLead,
  listMedia,
  setMediaProperty,
  setMediaMessage,
  searchProperties,
} from '../../controllers/instagram.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

// Públicas: las llama Meta directo (sin cookies de sesión)
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook); // body crudo: ver express.raw en index.js
router.get('/oauth/callback', oauthCallback);
router.post('/data-deletion', express.urlencoded({ extended: false }), dataDeletionCallback);
router.get('/data-deletion/status', dataDeletionStatus);

// Panel "Instagram DM": cualquier usuario autenticado del CRM
router.use(isAuth);
router.get('/oauth/connect', connect);
router.get('/status', getStatus);
router.post('/disconnect', disconnect);
router.post('/refresh-token', refreshToken);
router.post('/subscribe', subscribe);
router.get('/config', getConfigHandler);
router.put('/config', updateConfig);
router.get('/leads', listLeads);
router.post('/leads/:id/retry', retryLead);
router.delete('/leads/:id', deleteLead);
router.get('/media', listMedia);
router.put('/media/:mediaId', setMediaProperty);
router.put('/media/:mediaId/message', setMediaMessage);
router.get('/properties', searchProperties);

export default router;
