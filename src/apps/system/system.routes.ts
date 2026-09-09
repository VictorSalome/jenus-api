import { Router } from "express";
import * as ctrl from "./system.controller.js";
import { asyncHandler } from "../../shared/http/index.js";

const router = Router();

router.get("/logs", asyncHandler(ctrl.getLogs));
router.get("/logs/modules", asyncHandler(ctrl.getModules));

export default router;
