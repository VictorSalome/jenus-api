import { Router } from 'express';
import authRoutes from '../../shared/auth/auth.routes.js';
import { refreshToken } from '../../shared/auth/jwt-auth.js';
import { asyncHandler } from '../../shared/http/index.js';

const router = Router();

router.use(authRoutes);
router.post('/refresh', asyncHandler(refreshToken));

export default router;