import { Router } from "express";
import { asyncHandler } from "./middleware/errorHandler.js";
import { getCompatibilidade, listarVagasComCompatibilidade } from "./compatibilidade.service.js";
import { logInfo } from "./utils/logger.js";

const router = Router();

/**
 * GET /api/curriculo/vagas/:id/compatibilidade
 * Retorna compatibilidade da vaga com o perfil do candidato
 */
router.get(
  "/vagas/:id/compatibilidade",
  asyncHandler(async (req, res) => {
    const vagaId = parseInt(req.params.id, 10);
    
    if (isNaN(vagaId)) {
      return res.status(400).json({
        success: false,
        error: "ID da vaga inválido"
      });
    }
    
    const resultado = await getCompatibilidade(vagaId);
    
    logInfo("Compatibilidade calculada", { vagaId, matchPercent: resultado.matchPercent });
    
    res.json(resultado);
  })
);

/**
 * GET /api/curriculo/vagas
 * Lista todas as vagas com compatibilidade
 */
router.get(
  "/vagas",
  asyncHandler(async (req, res) => {
    const vagas = await listarVagasComCompatibilidade();
    
    res.json({
      success: true,
      vagas
    });
  })
);

export default router;