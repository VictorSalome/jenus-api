import { Router } from 'express';
import * as statsController from './stats.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';

const router = Router();

router.get('/overview', requireAuth, statsController.getOverview);
router.get('/by-channel', requireAuth, statsController.getByChannel);
router.get('/by-filter', requireAuth, statsController.getByFilter);

export default router;
