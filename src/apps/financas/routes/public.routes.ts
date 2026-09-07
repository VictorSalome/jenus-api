import { Router } from "express";
import { shortcutWebhook } from "../controllers/webhook.controller.js";
import { asyncHandler } from "../shared/errors.js";

const publicRouter = Router();

publicRouter.post("/webhook/shortcut", asyncHandler(shortcutWebhook));

export default publicRouter;
