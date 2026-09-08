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

const router = Router();

router.get("/status", obterStatus);
router.post("/start", iniciar);
router.post("/stop", parar);
router.post("/executar", executarAgora);
router.get("/empresas", listar);
router.get("/empresa/:slug", buscarPorSlug);
router.patch("/empresa/:id/status", atualizarStatusLead);
router.post("/empresa/:id/aprovar", aprovarLead);
router.post("/empresa/:id/rejeitar", rejeitarLead);
router.post("/empresa/:id/disparar", dispararLead);
router.post("/empresa/:id/converter", converterLead);

export default router;
