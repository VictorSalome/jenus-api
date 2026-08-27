import { Router } from 'express';
import * as testController from './test-connection.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';

const router = Router();

router.post('/telegram', requireAuth, testController.testTelegram);
router.post('/filters', requireAuth, testController.testFilters);

export default router;
