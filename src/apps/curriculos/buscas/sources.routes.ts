import express from "express";
import { listarFontesComStatus, salvarConfiguracaoFonte } from "./sourceCredentials.service.js";
import { logError } from "../shared/utils/logger.js";

const router = express.Router();

/**
 * GET /sources
 * Lista fontes de vagas com status (ligada/desligada, credenciais configuradas).
 */
router.get("/sources", async (req: any, res: any) => {
  try {
    const fontes = await listarFontesComStatus();
    res.json({ ok: true, fontes });
  } catch (err: any) {
    logError(`Erro ao listar fontes: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /sources/:id
 * Salva credenciais e/ou liga/desliga uma fonte de vagas.
 * Body: { enabled?: boolean, credentials?: Record<string, string> }
 */
router.put("/sources/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { enabled, credentials } = req.body || {};

    await salvarConfiguracaoFonte(id, { enabled, credentials });

    res.json({ ok: true });
  } catch (err: any) {
    logError(`Erro ao salvar fonte: ${err.message}`);
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
