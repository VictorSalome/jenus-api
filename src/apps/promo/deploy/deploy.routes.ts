import { Router } from "express";
import multer from "multer";
import { uploadDeploy, triggerDeploy } from "./deploy.controller.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("file"), uploadDeploy);
router.post("/trigger", triggerDeploy);

export default router;
