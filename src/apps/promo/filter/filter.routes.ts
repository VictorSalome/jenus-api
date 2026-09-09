import { Router } from "express";
import * as filterController from "./filter.controller.js";
import { requireAuth } from "../../../shared/auth/auth.middleware.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(filterController.list));
router.get("/stats", requireAuth, asyncHandler(filterController.getStats));
router.post("/categories", requireAuth, asyncHandler(filterController.createCategory));
router.put("/categories/:id", requireAuth, asyncHandler(filterController.updateCategory));
router.delete("/categories/:id", requireAuth, asyncHandler(filterController.deleteCategory));
router.post("/", requireAuth, asyncHandler(filterController.createFilter));
router.post("/toggle-all", requireAuth, asyncHandler(filterController.toggleAll));
router.put("/:id", requireAuth, asyncHandler(filterController.updateFilter));
router.post("/:id/toggle", requireAuth, asyncHandler(filterController.toggle));
router.delete("/:id", requireAuth, asyncHandler(filterController.remove));

export default router;
