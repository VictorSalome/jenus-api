import express from "express";
import {
  visualizarCurriculoHTML,
  enviarCurriculoTesteHTML,
} from "./teste.controller.js";

const router = express.Router();

router.get("/curriculo-html", visualizarCurriculoHTML);
router.post("/curriculo-teste-email", enviarCurriculoTesteHTML);

export default router;
