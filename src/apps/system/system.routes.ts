import { Router } from "express";
import * as ctrl from "./system.controller.js";

const router = Router();

router.get("/logs", ctrl.getLogs);
router.get("/logs/modules", ctrl.getModules);

export default router;
