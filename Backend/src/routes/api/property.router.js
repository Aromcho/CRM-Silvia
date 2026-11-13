import { Router } from 'express';
import {
  getProperties, getPropertyById, createProperty, updateProperty, updatePropertyStatus, updatePropertyDifusion,
  getPropertyStats, getPropertyLocations, importRentals, duplicateProperty, getPropertyTabCounts,
} from '../../controllers/property.controller.js';
import { uploadPhotos, addPhotos, deletePhoto, reorderPhotos, updatePhotoDescription } from '../../controllers/propertyPhoto.controller.js';
import { addVideoLink, uploadVideoFile, addVideoFile, deleteVideo } from '../../controllers/propertyVideo.controller.js';
import { listDocuments, uploadDocuments, addDocuments, downloadDocument, deleteDocument } from '../../controllers/propertyDocument.controller.js';
import { createBooking, updateBooking, deleteBooking, issueBookingReceipt } from '../../controllers/propertyBooking.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';
import isAdmin from '../../middlewares/isAdmin.mid.js';

const router = Router();

router.get('/', isAuth, getProperties);
router.get('/stats', isAuth, getPropertyStats);
router.get('/tab-counts', isAuth, getPropertyTabCounts);
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
router.post('/:id/videos/link', isAuth, addVideoLink);
router.post('/:id/videos/upload', isAuth, uploadVideoFile.single('video'), addVideoFile);
router.delete('/:id/videos/:videoId', isAuth, deleteVideo);
router.post('/:id/bookings', isAuth, createBooking);
router.patch('/:id/bookings/:bookingId', isAuth, updateBooking);
router.delete('/:id/bookings/:bookingId', isAuth, deleteBooking);
router.post('/:id/bookings/:bookingId/receipt', isAuth, issueBookingReceipt);
router.get('/:id/documents', isAuth, listDocuments);
router.post('/:id/documents', isAuth, uploadDocuments.array('files', 10), addDocuments);
router.get('/:id/documents/:docId', isAuth, downloadDocument);
router.delete('/:id/documents/:docId', isAuth, deleteDocument);
router.post('/import-rentals', isAuth, isAdmin, importRentals);

export default router;
