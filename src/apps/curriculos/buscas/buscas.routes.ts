import express from "express";
import {
  listarFontesController,
  buscarVagasController,
  buscarPorFonteController,
  autoApplyController,
  schedulerStatusController,
  schedulerStartController,
  schedulerStopController,
  schedulerRunNowController,
  linkedinParseController,
  linkedinCronStatusController,
  linkedinCronStartController,
  linkedinCronStopController,
  linkedinCronRunNowController,
} from "./buscas.controller.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = express.Router();

// Busca
router.get("/fontes", asyncHandler(listarFontesController));
router.post("/", asyncHandler(buscarVagasController));
router.post("/fonte/:fonte", asyncHandler(buscarPorFonteController));
router.post("/auto-apply", asyncHandler(autoApplyController));

// Scheduler
router.get("/scheduler", asyncHandler(schedulerStatusController));
router.post("/scheduler/start", asyncHandler(schedulerStartController));
router.post("/scheduler/stop", asyncHandler(schedulerStopController));
router.post("/scheduler/run", asyncHandler(schedulerRunNowController));

// LinkedIn
router.post("/linkedin", asyncHandler(linkedinParseController));

// LinkedIn Cron (scraper automático)
router.get("/linkedin-cron", asyncHandler(linkedinCronStatusController));
router.post("/linkedin-cron/start", asyncHandler(linkedinCronStartController));
router.post("/linkedin-cron/stop", asyncHandler(linkedinCronStopController));
router.post("/linkedin-cron/run", asyncHandler(linkedinCronRunNowController));

export default router;