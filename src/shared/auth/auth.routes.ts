import { Router } from 'express';
import * as authController from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

const router = Router();

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/forgot-password', authController.forgotPassword);

export default router;