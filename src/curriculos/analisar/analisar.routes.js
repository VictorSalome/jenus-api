import express from "express";
import {
  gerarCurriculoController,
  enviarCurriculoController,
  statusController,
  analisarVagaController,
} from "./analisar.controller.js";

const router = express.Router();

router.get("/status", statusController);
router.get("/health", statusController);
router.post("/analisar-vaga", analisarVagaController);
router.post("/gerar-curriculo", gerarCurriculoController);
router.post("/enviar-curriculo", enviarCurriculoController);

export default router;
