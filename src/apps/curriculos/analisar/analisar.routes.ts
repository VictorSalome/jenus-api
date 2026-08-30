import express from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import config from "../config/index.js";
import {
  gerarCurriculoController,
  enviarCurriculoController,
  statusController,
  analisarVagaController,
} from "./analisar.controller.js";
import { getDb } from "../../../core/database.js";

const router = express.Router();

// Middleware para validar token de pré-visualização de PDF
const requirePdfPreviewToken = (req: any, res: any, next: any) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token não fornecido',
      },
    });
  }

  jwt.verify(
    token,
    process.env.JWT_ACCESS_SECRET || 'your-access-token-secret-change-me',
    (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Token inválido ou expirado',
          },
        });
      }

      if (decoded.type !== 'pdf-preview') {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Tipo de token inválido',
          },
        });
      }

      if (decoded.filename !== path.basename(req.params.filename)) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Nome do arquivo não corresponde',
          },
        });
      }

      const safeFilename = path.basename(req.params.filename);
      const filePath = path.join(config.paths.temp, safeFilename);
      const resolvedPath = path.resolve(filePath);
      const tempDir = path.resolve(config.paths.temp);

      if (!resolvedPath.startsWith(tempDir)) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Caminho inválido',
          },
        });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Arquivo não encontrado',
          },
        });
      }

      next();
    }
  );
};

router.get("/status", statusController);
router.get("/health", statusController);
router.post("/analisar-vaga", analisarVagaController);
router.post("/gerar-curriculo", gerarCurriculoController);
router.post("/enviar-curriculo", enviarCurriculoController);

// Rota explícita para download/visualização do PDF na pasta temp (sem auth - usa pdf-preview token)
export const pdfPreviewRouter = express.Router();
pdfPreviewRouter.get('/temp/:filename', requirePdfPreviewToken, async (req: any, res: any) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(config.paths.temp, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Arquivo não encontrado',
      },
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath, (err: Error | null) => {
    if (err) {
      console.error('Erro ao servir o PDF:', err);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Erro ao servir o arquivo',
        },
      });
    }
  });
});

// Rota para regerar PDF a partir de um envio
router.post("/envios/:id/regerar-pdf", requireAuth, async (req: any, res: any) => {
  try {
    const envioId = req.params.id;
    const db = await getDb();
    const envio = await db.get("SELECT * FROM curriculo_envios WHERE id = ?", envioId);
    
    if (!envio) {
      return res.status(404).json({ success: false, error: { message: "Envio não encontrado" } });
    }

    const user = req.user;
    const isAdmin = user.role === "admin";
    if (!isAdmin && envio.email_destino !== user.email) {
      return res.status(403).json({ success: false, error: { message: "Acesso negado" } });
    }

    if (!envio.curriculo_snapshot) {
      return res.status(400).json({ success: false, error: { message: "Snapshot do currículo não disponível para este envio" } });
    }

    const snapshot = JSON.parse(envio.curriculo_snapshot);
    const vaga = await db.get("SELECT * FROM curriculo_vagas WHERE id = ?", envio.vaga_id);
    
    const dadosVaga = {
      titulo: envio.vaga_titulo,
      empresa: vaga?.company || "",
      areaAtuacao: vaga?.skills_json ? JSON.parse(vaga.skills_json)[0] || "" : "",
      stackTecnologica: vaga?.skills_json ? JSON.parse(vaga.skills_json) : [],
      emailContato: envio.email_destino
    };

    const { gerarPdfCurriculo } = await import("../shared/pdf/pdfGenerator.service.js");
    const caminhoPdf = await gerarPdfCurriculo(snapshot, dadosVaga);
    const filename = path.basename(caminhoPdf);

    return res.json({
      success: true,
      previewUrl: `/api/curriculo/temp/${filename}`,
      filename,
    });
  } catch (error) {
    console.error("Erro ao regerar PDF:", error);
    return res.status(500).json({ success: false, error: { message: error.message || "Erro interno" } });
  }
});

// Rota para gerar token temporário
router.post('/temp/:filename/token', requireAuth, async (req: any, res: any) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(config.paths.temp, safeFilename);

    // Verifica se o arquivo existe na pasta temporária
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Arquivo não encontrado na pasta temporária',
          status: 404,
        },
      });
    }

    // Gera token temporário (válido por 5 minutos)
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Usuário não autenticado',
          status: 401,
        },
      });
    }

    const expirySeconds = 300; // 5 minutos
    const token = jwt.sign({
      type: 'pdf-preview',
      filename: safeFilename,
      userId: user.userId,
    }, process.env.JWT_ACCESS_SECRET || 'your-access-token-secret-change-me', {
      expiresIn: expirySeconds,
    });

    res.json({
      success: true,
      token,
      expiresIn: 300,
    });
  } catch (error) {
    console.error('Erro ao gerar token temporário:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Erro interno',
        status: 500,
      },
    });
  }
});

export default router;