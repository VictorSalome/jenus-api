import { Router } from 'express';
import * as backupController from './backup.controller.js';
import { requireAuth } from '../../shared/auth/auth.middleware.js';

const router = Router();

router.get('/export', requireAuth, backupController.exportConfig);
router.post('/import', requireAuth, backupController.importConfig);

export default router;
