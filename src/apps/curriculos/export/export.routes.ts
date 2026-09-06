import { Router } from "express";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import { validateBody } from "../../../shared/middleware/validate-body.js";
import { ExportRequestSchema } from "../../../shared/schemas/index.js";
import { exportarCurriculo } from "./export.controller.js";

const router = Router();

// Exportação requer auth (JWT) — o download no app usa o access token
// no header; o compartilhamento é feito pelo expo-sharing com o arquivo local.
router.post("/export", requireAuth, validateBody(ExportRequestSchema), exportarCurriculo);

export default router;
