import { Router } from 'express';
import authRoutes from '../../shared/auth/auth.routes.js';
import { refreshToken } from '../../shared/auth/jwt-auth.js';

const router = Router();

router.use(authRoutes);
router.post('/refresh', refreshToken);

export default router;