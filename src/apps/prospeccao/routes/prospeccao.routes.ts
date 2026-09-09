import { Router } from "express";
import {
  obterStatus,
  iniciar,
  parar,
  executarAgora,
  listar,
  buscarPorSlug,
  atualizarStatusLead,
  aprovarLead,
  rejeitarLead,
  dispararLead,
  converterLead,
} from "../controllers/prospeccao.controller.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();

router.get("/status", asyncHandler(obterStatus));
router.post("/start", asyncHandler(iniciar));
router.post("/stop", asyncHandler(parar));
router.post("/executar", asyncHandler(executarAgora));
router.get("/empresas", asyncHandler(listar));
router.get("/empresa/:slug", asyncHandler(buscarPorSlug));
router.patch("/empresa/:id/status", asyncHandler(atualizarStatusLead));
router.post("/empresa/:id/aprovar", asyncHandler(aprovarLead));
router.post("/empresa/:id/rejeitar", asyncHandler(rejeitarLead));
router.post("/empresa/:id/disparar", asyncHandler(dispararLead));
router.post("/empresa/:id/converter", asyncHandler(converterLead));

export default router;
