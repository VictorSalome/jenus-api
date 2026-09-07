import { Router } from 'express';
import * as controller from './notification.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

const router = Router();

// Consulta do catálogo de tipos é pública/aberta
router.get('/types', controller.getTypes);

// Disparo de teste requer autenticação
router.post('/test', requireAuth, controller.testDispatch);

// Preferências e histórico requerem autenticação
router.get('/preferences', requireAuth, controller.getPreferences);
router.put('/preferences', requireAuth, controller.updatePreference);
router.get('/history', requireAuth, controller.getHistory);

export default router;
