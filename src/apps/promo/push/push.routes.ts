import { Router } from 'express';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { pushController } from './push.controller.js';

const router = Router();

router.post('/register', requireAuth, pushController.register);
router.post('/unregister', requireAuth, pushController.unregister);
router.post('/test', requireAuth, pushController.test);
router.get('/stats', requireAuth, pushController.stats);

export default router;
