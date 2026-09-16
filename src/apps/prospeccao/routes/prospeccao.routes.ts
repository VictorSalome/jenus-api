import { Router } from "express";
import {
  obterStatus,
  obterProgressoController,
  iniciar,
  parar,
  executarAgora,
  listar,
  buscarPorSlug,
  atualizarStatusLead,
  aprovarLead,
  rejeitarLead,
  dispararLead,
  responderLead,
  converterLead,
} from "../controllers/prospeccao.controller.js";
import { asyncHandler } from "../../../shared/http/index.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";

import { validateBody } from "../../../shared/middleware/validate-body.js";
import { validateQuery } from "../../../shared/middleware/validate-query.js";
import { validateParams } from "../../../shared/middleware/validate-params.js";
import {
  UuidParamSchema,
  PaginationQuerySchema,
  ProspeccaoStatusBodySchema,
  ProspeccaoRejeitarBodySchema,
  ProspeccaoDispararBodySchema
} from "../../../shared/schemas/index.js";

const router = Router();

// Rota pública: consumida sem autenticação pelo jenus-site para montar as
// landing pages demo (/demo/[slug]).
router.get("/empresa/:slug", asyncHandler(buscarPorSlug));

// Demais rotas exigem autenticação JWT — inclui /empresas, que lista PII de
// todos os leads e só deve ser acessada pelo painel admin autenticado.
router.use(requireAuth);

router.get("/empresas", validateQuery(PaginationQuerySchema), asyncHandler(listar));
router.get("/status", asyncHandler(obterStatus));
router.get("/progresso", asyncHandler(obterProgressoController));
router.post("/start", asyncHandler(iniciar));
router.post("/stop", asyncHandler(parar));
router.post("/executar", asyncHandler(executarAgora));
router.patch("/empresa/:id/status", validateParams(UuidParamSchema), validateBody(ProspeccaoStatusBodySchema), asyncHandler(atualizarStatusLead));
router.post("/empresa/:id/aprovar", validateParams(UuidParamSchema), asyncHandler(aprovarLead));
router.post("/empresa/:id/rejeitar", validateParams(UuidParamSchema), validateBody(ProspeccaoRejeitarBodySchema), asyncHandler(rejeitarLead));
router.post("/empresa/:id/disparar", validateParams(UuidParamSchema), validateBody(ProspeccaoDispararBodySchema), asyncHandler(dispararLead));
router.post("/empresa/:id/responder", validateParams(UuidParamSchema), asyncHandler(responderLead));
router.post("/empresa/:id/converter", validateParams(UuidParamSchema), asyncHandler(converterLead));

export default router;
