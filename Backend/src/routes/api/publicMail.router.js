import express, { Router } from 'express';
import { unsubscribeForm, unsubscribeConfirm } from '../../controllers/mailMarketing.controller.js';

const router = Router();

// Públicas: las abre el destinatario desde el mail (o Gmail con List-Unsubscribe-Post), sin sesión.
// El link va firmado con HMAC, así que no se puede dar de baja a otro adivinando su email.
router.get('/unsubscribe', unsubscribeForm);
router.post('/unsubscribe', express.urlencoded({ extended: false }), unsubscribeConfirm);

export default router;
