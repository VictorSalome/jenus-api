import { Router } from "express";
import * as filterController from "./filter.controller.js";
import { requireAuth } from "../../shared/auth/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, filterController.list);
router.get("/stats", requireAuth, filterController.getStats);
router.post("/categories", requireAuth, filterController.createCategory);
router.put("/categories/:id", requireAuth, filterController.updateCategory);
router.delete("/categories/:id", requireAuth, filterController.deleteCategory);
router.post("/", requireAuth, filterController.createFilter);
router.post("/toggle-all", requireAuth, filterController.toggleAll);
router.put("/:id", requireAuth, filterController.updateFilter);
router.post("/:id/toggle", requireAuth, filterController.toggle);
router.delete("/:id", requireAuth, filterController.remove);

export default router;
