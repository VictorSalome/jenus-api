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

// Rota explícita para download/visualização do PDF na pasta temp (prefixo /api para evitar conflito com Nginx)
router.get("/temp/:filename", (req, res) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(config.paths.temp, safeFilename);

  console.log('Tentando servir arquivo:', filePath);
  console.log('Pasta temp configurada:', config.paths.temp);

  if (!fs.existsSync(filePath)) {
    console.log('Arquivo não encontrado:', filePath);
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
