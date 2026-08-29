import { Router } from 'express';
import {
  getProperties, getPropertyById, createProperty, updateProperty, updatePropertyStatus, updatePropertyDifusion,
  triggerSync, getPropertyStats, getPropertyLocations, importRentals, duplicateProperty,
} from '../../controllers/property.controller.js';
import { uploadPhotos, addPhotos, deletePhoto, reorderPhotos, updatePhotoDescription } from '../../controllers/propertyPhoto.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';
import isAdmin from '../../middlewares/isAdmin.mid.js';

const router = Router();

router.get('/', isAuth, getProperties);
router.get('/stats', isAuth, getPropertyStats);
router.get('/locations', isAuth, getPropertyLocations);
router.get('/:id', isAuth, getPropertyById);
router.post('/', isAuth, createProperty);
router.post('/:id/duplicate', isAuth, duplicateProperty);
router.put('/:id', isAuth, updateProperty);
router.patch('/:id/status', isAuth, updatePropertyStatus);
router.patch('/:id/difusion', isAuth, updatePropertyDifusion);
router.post('/:id/photos', isAuth, uploadPhotos.array('photos', 30), addPhotos);
router.patch('/:id/photos/reorder', isAuth, reorderPhotos);
router.patch('/:id/photos/:photoId/description', isAuth, updatePhotoDescription);
router.delete('/:id/photos/:photoId', isAuth, deletePhoto);
router.post('/sync', isAuth, isAdmin, triggerSync);
router.post('/import-rentals', isAuth, isAdmin, importRentals);

export default router;
