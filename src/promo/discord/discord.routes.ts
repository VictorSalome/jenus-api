import { Router } from "express";
import * as discordController from "./discord.controller.js";
import { requireAuth } from "../../shared/auth/auth.middleware.js";

const router = Router();

router.post("/test", requireAuth, discordController.testDiscord);

export default router;
