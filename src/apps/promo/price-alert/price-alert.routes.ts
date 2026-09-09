import { Router } from 'express';
import * as priceAlertController from './price-alert.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { asyncHandler } from '../../../shared/http/index.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(priceAlertController.list));
router.post('/', requireAuth, asyncHandler(priceAlertController.create));
router.put('/:id', requireAuth, asyncHandler(priceAlertController.update));
router.post('/:id/toggle', requireAuth, asyncHandler(priceAlertController.toggle));
router.delete('/:id', requireAuth, asyncHandler(priceAlertController.remove));

export default router;
