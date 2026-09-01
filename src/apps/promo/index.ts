import { Router } from "express";
import type { AppModule } from "../../shared/http/app-registry.js";
import telegramConfigRoutes from "./telegram-config/telegram-config.routes.js";
import telegramBotConfigRoutes from "./telegram-bot-config/telegram-bot-config.routes.js";
import discordWebhookConfigRoutes from "./discord-webhook-config/discord-webhook-config.routes.js";
import channelRoutes from "./channel/channel.routes.js";
import filterRoutes from "./filter/filter.routes.js";
import monitorRoutes from "./monitor/monitor.routes.js";
import discordRoutes from "./discord/discord.routes.js";
import statsRoutes from "./stats/stats.routes.js";
import backupRoutes from "./backup/backup.routes.js";
import testConnectionRoutes from "./test-connection/test-connection.routes.js";
import priceAlertRoutes from "./price-alert/price-alert.routes.js";
import deployRoutes from "./deploy/deploy.routes.js";
import pushRoutes from "./push/push.routes.js";

const router = Router();

router.use("/telegram-config", telegramConfigRoutes);
router.use("/telegram-bot-config", telegramBotConfigRoutes);
router.use("/discord-webhook-config", discordWebhookConfigRoutes);
router.use("/channels", channelRoutes);
router.use("/filters", filterRoutes);
router.use("/monitor", monitorRoutes);
router.use("/discord", discordRoutes);
router.use("/stats", statsRoutes);
router.use("/backup", backupRoutes);
router.use("/test", testConnectionRoutes);
router.use("/price-alerts", priceAlertRoutes);
router.use("/deploy", deployRoutes);
router.use("/push", pushRoutes);

const promoModule: AppModule = {
  name: "promo",
  prefix: "/api",
  router,
  // promo aplica requireAuth rota a rota (mantém deploy/* público, como hoje).
  protected: false,
};

export default promoModule;
