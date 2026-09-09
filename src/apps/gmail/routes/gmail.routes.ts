import { Router } from "express";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import * as ctrl from "../controllers/gmail.controller.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();

router.get("/auth-url", requireAuth, asyncHandler(ctrl.authUrl));
router.get("/status", requireAuth, asyncHandler(ctrl.status));
router.get("/messages", requireAuth, asyncHandler(ctrl.messages));
router.post("/send", requireAuth, asyncHandler(ctrl.send));
router.delete("/disconnect", requireAuth, asyncHandler(ctrl.disconnect));
// Callback é público (Google redireciona o navegador aqui)
router.get("/callback", asyncHandler(ctrl.callback));

export default router;