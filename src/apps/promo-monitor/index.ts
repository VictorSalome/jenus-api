import { Router } from 'express';
import telegramConfigRoutes from '../../promo/telegram-config/telegram-config.routes.js';
import channelRoutes from '../../promo/channel/channel.routes.js';
import filterRoutes from '../../promo/filter/filter.routes.js';
import monitorRoutes from '../../promo/monitor/monitor.routes.js';
import discordRoutes from '../../promo/discord/discord.routes.js';
import statsRoutes from '../../promo/stats/stats.routes.js';
import backupRoutes from '../../promo/backup/backup.routes.js';
import testConnectionRoutes from '../../promo/test-connection/test-connection.routes.js';
import priceAlertRoutes from '../../promo/price-alert/price-alert.routes.js';
import deployRoutes from '../../promo/deploy/deploy.routes.js';
import pushRoutes from '../../promo/push/push.routes.js';

const router = Router();

router.use('/telegram-config', telegramConfigRoutes);
router.use('/channels', channelRoutes);
router.use('/filters', filterRoutes);
router.use('/monitor', monitorRoutes);
router.use('/discord', discordRoutes);
router.use('/stats', statsRoutes);
router.use('/backup', backupRoutes);
router.use('/test', testConnectionRoutes);
router.use('/price-alerts', priceAlertRoutes);
router.use('/deploy', deployRoutes);
router.use('/push', pushRoutes);

export default router;