import { Router } from 'express';
import * as controller from './notification.controller.js';
import { requireAuth, optionalAuth } from '../auth/auth.middleware.js';

const router = Router();

// Consulta do catálogo de tipos é pública/aberta
router.get('/types', controller.getTypes);

// Disparo de teste permite testar tanto autenticado quanto via chave/dev
router.post('/test', optionalAuth, controller.testDispatch);

// Preferências e histórico requerem autenticação (ou fallback para usuário padrão)
router.get('/preferences', optionalAuth, controller.getPreferences);
router.put('/preferences', optionalAuth, controller.updatePreference);
router.get('/history', optionalAuth, controller.getHistory);

export default router;
