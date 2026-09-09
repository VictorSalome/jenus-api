import { Router } from 'express';
import * as testController from './test-connection.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { asyncHandler } from '../../../shared/http/index.js';

const router = Router();

router.post('/telegram', requireAuth, asyncHandler(testController.testTelegram));
router.post('/filters', requireAuth, asyncHandler(testController.testFilters));

export default router;
