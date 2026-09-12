import { Router } from 'express';
import { createLead } from '../../controllers/lead.controller.js';
import apiKey from '../../middlewares/apiKey.mid.js';

const router = Router();

// Usado por web-silvia-next para volcar las consultas del formulario de contacto
// como Lead (source: 'web'), igual que ya hace con las propiedades públicas.
router.post('/', apiKey, createLead);

export default router;
