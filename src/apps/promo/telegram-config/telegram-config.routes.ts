import { Router } from 'express';
import * as telegramConfigController from './telegram-config.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { asyncHandler } from '../../../shared/http/index.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(telegramConfigController.getConfig));
router.post('/', requireAuth, asyncHandler(telegramConfigController.saveConfig));
router.get('/status', asyncHandler(telegramConfigController.getStatus));
router.get('/auth-status', asyncHandler(telegramConfigController.getAuthStatus));
router.post('/auth/start', requireAuth, asyncHandler(telegramConfigController.startAuth));
router.post('/auth/verify', requireAuth, asyncHandler(telegramConfigController.verifyAuth));

export default router;
