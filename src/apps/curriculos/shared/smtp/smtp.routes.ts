import express from "express";
import {
  testarSMTPController,
  obterConfigSMTPController,
  atualizarConfigSMTPController,
} from "../../analisar/analisar.controller.js";
import { asyncHandler } from "../../../../shared/http/index.js";

const router = express.Router();

router.get("/smtp-test", asyncHandler(testarSMTPController));
router.get("/config/smtp", asyncHandler(obterConfigSMTPController));
router.put("/config/smtp", asyncHandler(atualizarConfigSMTPController));

export default router;
