import { Router } from 'express';
import { requireAuth, optionalAuth } from '../../../shared/auth/auth.middleware.js';
import { pushController } from './push.controller.js';

const router = Router();

router.post('/register', optionalAuth, pushController.register);
router.post('/unregister', optionalAuth, pushController.unregister);
router.post('/test', requireAuth, pushController.test);
router.get('/stats', requireAuth, pushController.stats);

export default router;
