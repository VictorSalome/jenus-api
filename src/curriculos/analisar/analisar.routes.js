import express from "express";
import path from "path";
import fs from "fs";
import {
  gerarCurriculoController,
  enviarCurriculoController,
  statusController,
  analisarVagaController,
} from "./analisar.controller.js";
import config from "../config/index.js";

const router = express.Router();

router.get("/status", statusController);
router.get("/health", statusController);
router.post("/analisar-vaga", analisarVagaController);
router.post("/gerar-curriculo", gerarCurriculoController);
router.post("/enviar-curriculo", enviarCurriculoController);

// Rota explícita para download/visualização do PDF na pasta temp
router.get("/temp/:filename", (req, res) => {
  const { filename } = req.params;
  // Prevenir Path Traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(config.paths.temp, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: {
        message: "PDF não encontrado na pasta temporária",
        status: 404,
      },
    });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
  return res.sendFile(filePath);
});

export default router;
