import { Router } from 'express';
import * as statsController from './stats.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { asyncHandler } from '../../../shared/http/index.js';

const router = Router();

router.get('/overview', requireAuth, asyncHandler(statsController.getOverview));
router.get('/by-channel', requireAuth, asyncHandler(statsController.getByChannel));
router.get('/by-filter', requireAuth, asyncHandler(statsController.getByFilter));

export default router;
