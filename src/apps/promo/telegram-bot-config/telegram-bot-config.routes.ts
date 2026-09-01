import { Router } from "express";
import * as controller from "./telegram-bot-config.controller.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, controller.getConfig);
router.post("/", requireAuth, controller.saveConfig);
router.post("/test", requireAuth, controller.testToken);
router.delete("/", requireAuth, controller.revokeConfig);

export default router;
