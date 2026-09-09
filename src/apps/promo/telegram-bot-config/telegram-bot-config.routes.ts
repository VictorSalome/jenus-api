import { Router } from "express";
import * as controller from "./telegram-bot-config.controller.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(controller.getConfig));
router.post("/", requireAuth, asyncHandler(controller.saveConfig));
router.post("/test", requireAuth, asyncHandler(controller.testToken));
router.delete("/", requireAuth, asyncHandler(controller.revokeConfig));

export default router;
