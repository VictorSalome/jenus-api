import express from "express";
import {
  visualizarCurriculoHTML,
  enviarCurriculoTesteHTML,
} from "./teste.controller.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = express.Router();

router.get("/curriculo-html", asyncHandler(visualizarCurriculoHTML));
router.post("/curriculo-teste-email", asyncHandler(enviarCurriculoTesteHTML));

export default router;
