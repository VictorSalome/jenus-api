import { Router } from 'express';
import * as monitorController from './monitor.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';

const router = Router();

router.get('/status', requireAuth, monitorController.getStatus);
router.get('/connection-status', requireAuth, monitorController.getConnectionStatusEndpoint);
router.post('/test-connection', requireAuth, monitorController.testConnection);
router.post('/test-flow', requireAuth, monitorController.testFullFlow);
router.post('/start', requireAuth, monitorController.start);
router.post('/stop', requireAuth, monitorController.stop);
router.post('/force-check', requireAuth, monitorController.forceCheck);

export default router;
