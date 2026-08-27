import { Router } from 'express';
import * as telegramConfigController from './telegram-config.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, telegramConfigController.getConfig);
router.post('/', requireAuth, telegramConfigController.saveConfig);
router.get('/status', telegramConfigController.getStatus);
router.get('/auth-status', telegramConfigController.getAuthStatus);
router.post('/auth/start', requireAuth, telegramConfigController.startAuth);
router.post('/auth/verify', requireAuth, telegramConfigController.verifyAuth);

export default router;
