import { Router } from 'express';
import * as backupController from './backup.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { asyncHandler } from '../../../shared/http/index.js';

const router = Router();

router.get('/export', requireAuth, asyncHandler(backupController.exportConfig));
router.post('/import', requireAuth, asyncHandler(backupController.importConfig));

export default router;
