import { Router } from "express";
import * as exemploController from "../controllers/exemplo.controller.js";

// TODO: renomeie o arquivo/rota para a entidade real.

const router = Router();

router.get("/", exemploController.list);
router.post("/", exemploController.create);

export default router;
