import { Router } from "express";
import multer from "multer";
import { uploadDeploy, triggerDeploy } from "./deploy.controller.js";
import { asyncHandler } from "../../../shared/http/index.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("file"), asyncHandler(uploadDeploy));
router.post("/trigger", asyncHandler(triggerDeploy));

export default router;
