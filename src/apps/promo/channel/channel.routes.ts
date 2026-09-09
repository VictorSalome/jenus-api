import { Router } from 'express';
import * as channelController from './channel.controller.js';
import { requireAuth } from '../../../shared/auth/auth.middleware.js';
import { asyncHandler } from '../../../shared/http/index.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(channelController.list));
router.post('/', requireAuth, asyncHandler(channelController.create));
router.delete('/:id', requireAuth, asyncHandler(channelController.remove));
router.post('/:id/toggle', requireAuth, asyncHandler(channelController.toggle));

export default router;
