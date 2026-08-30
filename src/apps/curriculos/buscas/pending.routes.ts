import { Router } from "express";
import { asyncHandler } from "../shared/middleware/errorHandler.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import { listarPendentes, aprovarEEnviar, rejeitar } from "./pendingApplications.service.js";

const router = Router();

/**
 * GET /api/curriculo/pending-applications?status=pending|approved|rejected|sent|error|all
 * Lista candidaturas geradas pelo pipeline aguardando revisão (ou por outro status).
 * Default: status=pending.
 */
router.get(
  "/pending-applications",
  asyncHandler(async (req, res) => {
    const status = (req.query.status as string) || "pending";
    const pendentes = await listarPendentes(status);
    res.json({
      success: true,
      total: pendentes.length,
      pendentes: pendentes.map((p) => ({
        id: p.id,
        vaga: { source: p.vaga_source, title: p.vaga_title, company: p.vaga_company, url: p.vaga_url },
        score: p.score,
        emailDestino: p.email_destino,
        dadosVaga: JSON.parse(p.dados_vaga_json),
        status: p.status,
        erro: p.erro,
        createdAt: p.created_at,
        reviewedAt: p.reviewed_at,
      })),
    });
  }),
);

/**
 * POST /api/curriculo/pending-applications/:id/aprovar
 * Gera o currículo (com o perfil atual) e envia de fato o email.
 */
router.post(
  "/pending-applications/:id/aprovar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "id inválido" });
    }
    try {
      const resultado = await aprovarEEnviar(id);
      res.json({ success: true, status: resultado.status });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }),
);

/**
 * POST /api/curriculo/pending-applications/:id/rejeitar
 */
router.post(
  "/pending-applications/:id/rejeitar",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: "id inválido" });
    }
    try {
      await rejeitar(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }),
);

export default router;
