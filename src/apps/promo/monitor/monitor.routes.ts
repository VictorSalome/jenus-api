import { Router } from 'express';
import * as monitorController from './monitor.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { asyncHandler } from '../../../shared/http/index.js';

const router = Router();

router.get('/status', requireAuth, asyncHandler(monitorController.getStatus));
router.get('/connection-status', requireAuth, asyncHandler(monitorController.getConnectionStatusEndpoint));
router.post('/test-connection', requireAuth, asyncHandler(monitorController.testConnection));
router.post('/test-flow', requireAuth, asyncHandler(monitorController.testFullFlow));
router.post('/start', requireAuth, asyncHandler(monitorController.start));
router.post('/stop', requireAuth, asyncHandler(monitorController.stop));
router.post('/force-check', requireAuth, asyncHandler(monitorController.forceCheck));

export default router;
