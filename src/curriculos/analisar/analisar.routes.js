import express from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { requireAuth } from "../../shared/auth/jwt-auth.js";
import config from "../config/index.js";
import {
  gerarCurriculoController,
  enviarCurriculoController,
  statusController,
  analisarVagaController,
} from "./analisar.controller.js";

const router = express.Router();

// Middleware para validar token de pré-visualização de PDF
const requirePdfPreviewToken = (req, res, next) => {
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
    (err, decoded) => {
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

// Rota explícita para download/visualização do PDF na pasta temp
router.get('/temp/:filename', requirePdfPreviewToken, async (req, res) => {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(config.paths.temp, safeFilename);

  // Verifica se o arquivo existe (já validado no middleware, mas garantimos)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Arquivo não encontrado',
      },
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath, (err) => {
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

// Rota para gerar token temporário
router.post('/temp/:filename/token', requireAuth, async (req, res) => {
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