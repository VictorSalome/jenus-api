import express from "express";
import {
  testarSMTPController,
  obterConfigSMTPController,
  atualizarConfigSMTPController,
} from "../analisar/analisar.controller.js";

const router = express.Router();

router.get("/smtp-test", testarSMTPController);
router.get("/config/smtp", obterConfigSMTPController);
router.put("/config/smtp", atualizarConfigSMTPController);

export default router;
