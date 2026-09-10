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

const router = Router();

// Controle e Status
router.get("/automacao/status", obterStatusController);
router.get("/automacao/preview", obterPreviewController);
router.get("/automacao/preview/:jobId/curriculo", obterPreviewCurriculoVagaController);

router.post("/automacao/start", iniciarAutomacaoController);
router.post("/automacao/pause", pausarAutomacaoController);
router.post("/automacao/resume", retomarAutomacaoController);
router.post("/automacao/stop", pararAutomacaoController);

// Histórico e Configurações
router.get("/automacao/logs", obterLogsController);
router.get("/automacao/candidaturas", obterCandidaturasController);
router.put("/automacao/config", atualizarConfiguracaoController);

export default router;
