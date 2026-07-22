import { Router } from 'express';
import {
  syncToMercadoLibre,
  syncAllMercadoLibre,
  getMercadoLibreStatus,
  handleMercadoLibreLead,
  connectMercadoLibre,
  oauthCallback,
  getListingTypes,
  upgradeListingType,
  getMercadoLibreSummary,
  getPropertyMetrics,
  collectMercadoLibreMetrics,
  discoverExistingListings,
  confirmLinkListing,
} from '../../controllers/mercadolibre.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/oauth/connect', isAuth, connectMercadoLibre);
router.get('/oauth/callback', oauthCallback); // público: ML redirige acá sin cookies de sesión
router.post('/sync/:propertyId', isAuth, syncToMercadoLibre);
router.post('/sync-all', isAuth, syncAllMercadoLibre);
router.get('/status', isAuth, getMercadoLibreStatus);
router.get('/summary', isAuth, getMercadoLibreSummary);
router.get('/listing-types', isAuth, getListingTypes);
router.patch('/listing-type/:propertyId', isAuth, upgradeListingType);
router.get('/metrics/property/:propertyId', isAuth, getPropertyMetrics);
router.post('/metrics/collect', isAuth, collectMercadoLibreMetrics);
router.get('/discover-existing', isAuth, discoverExistingListings);
router.post('/link-existing', isAuth, confirmLinkListing);
router.post('/webhook/lead', handleMercadoLibreLead); // público

export default router;
