import { Router } from "express";
import * as exemploController from "../controllers/exemplo.controller.js";
import { asyncHandler } from "../../../shared/http/index.js";

// TODO: renomeie o arquivo/rota para a entidade real.

const router = Router();

router.get("/", asyncHandler(exemploController.list));
router.post("/", asyncHandler(exemploController.create));

export default router;
