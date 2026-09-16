import { Router } from "express";
import {
  obterStatusController,
  obterPreviewController,
  obterPreviewCurriculoVagaController,
  iniciarAutomacaoController,
  pausarAutomacaoController,
  retomarAutomacaoController,
  pararAutomacaoController,
  obterLogsController,
  obterCandidaturasController,
  atualizarConfiguracaoController,
} from "./automacao.controller.js";
import { validateBody } from "../../../shared/middleware/validate-body.js";
import { AutomacaoConfigSchema, EmptyBodySchema } from "../../../shared/schemas/index.js";

const router = Router();

// Controle e Status
router.get("/automacao/status", obterStatusController);
router.get("/automacao/preview", obterPreviewController);
router.get("/automacao/preview/:jobId/curriculo", obterPreviewCurriculoVagaController);

router.post("/automacao/start", validateBody(AutomacaoConfigSchema), iniciarAutomacaoController);
router.post("/automacao/pause", validateBody(EmptyBodySchema), pausarAutomacaoController);
router.post("/automacao/resume", validateBody(EmptyBodySchema), retomarAutomacaoController);
router.post("/automacao/stop", validateBody(EmptyBodySchema), pararAutomacaoController);

// Histórico e Configurações
router.get("/automacao/logs", obterLogsController);
router.get("/automacao/candidaturas", obterCandidaturasController);
router.put("/automacao/config", validateBody(AutomacaoConfigSchema), atualizarConfiguracaoController);

export default router;
