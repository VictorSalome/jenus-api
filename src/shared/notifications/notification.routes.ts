import { Router } from 'express';
import * as controller from './notification.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { asyncHandler } from '../http/index.js';

const router = Router();

// Consulta do catálogo de tipos é pública/aberta
router.get('/types', asyncHandler(controller.getTypes));

// Disparo de teste requer autenticação
router.post('/test', requireAuth, asyncHandler(controller.testDispatch));

// Preferências e histórico requerem autenticação
router.get('/preferences', requireAuth, asyncHandler(controller.getPreferences));
router.put('/preferences', requireAuth, asyncHandler(controller.updatePreference));
router.get('/history', requireAuth, asyncHandler(controller.getHistory));

export default router;
