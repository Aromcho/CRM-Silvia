import { Router } from 'express';
import {
  getFileRecords, getFileRecordById, createFileRecord, updateFileRecord,
  deleteFileRecord, uploadFiles, deleteFile, upload,
} from '../../controllers/fileRecord.controller.js';
import isAuth from '../../middlewares/isAuth.mid.js';

const router = Router();

router.get('/', isAuth, getFileRecords);
router.get('/:id', isAuth, getFileRecordById);
router.post('/', isAuth, createFileRecord);
router.patch('/:id', isAuth, updateFileRecord);
router.delete('/:id', isAuth, deleteFileRecord);
router.post('/:id/files', isAuth, upload.array('files', 20), uploadFiles);
router.delete('/:id/files/:fileId', isAuth, deleteFile);

export default router;
