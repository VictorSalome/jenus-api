import { Router } from "express";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import * as ctrl from "../controllers/gmail.controller.js";

const router = Router();

router.get("/auth-url", requireAuth, ctrl.authUrl);
router.get("/status", requireAuth, ctrl.status);
router.get("/messages", requireAuth, ctrl.messages);
router.post("/send", requireAuth, ctrl.send);
router.delete("/disconnect", requireAuth, ctrl.disconnect);
// Callback é público (Google redireciona o navegador aqui)
router.get("/callback", ctrl.callback);

export default router;