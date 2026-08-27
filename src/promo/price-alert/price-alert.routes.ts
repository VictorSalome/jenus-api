import { Router } from 'express';
import * as priceAlertController from './price-alert.controller.js';
import { requireAuth } from '../../shared/auth/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, priceAlertController.list);
router.post('/', requireAuth, priceAlertController.create);
router.put('/:id', requireAuth, priceAlertController.update);
router.post('/:id/toggle', requireAuth, priceAlertController.toggle);
router.delete('/:id', requireAuth, priceAlertController.remove);

export default router;
