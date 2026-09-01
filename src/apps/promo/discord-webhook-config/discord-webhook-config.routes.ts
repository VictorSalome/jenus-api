import { Router } from "express";
import * as controller from "./discord-webhook-config.controller.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, controller.getConfig);
router.post("/", requireAuth, controller.saveConfig);
router.post("/test", requireAuth, controller.testWebhook);
router.delete("/", requireAuth, controller.revokeConfig);

export default router;
