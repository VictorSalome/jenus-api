import { Router } from 'express';
import * as channelController from './channel.controller.js';
import { requireAuth } from '../../shared/auth/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, channelController.list);
router.post('/', requireAuth, channelController.create);
router.delete('/:id', requireAuth, channelController.remove);
router.post('/:id/toggle', requireAuth, channelController.toggle);

export default router;
