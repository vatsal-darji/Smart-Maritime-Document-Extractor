import { Router } from "express";
import {
  getSessionController,
  validateSessionController,
  getReportController,
} from "@/controllers/sessionController";

const router = Router();

router.get("/:sessionId", getSessionController);
router.post("/:sessionId/validate", validateSessionController);
router.get("/:sessionId/report", getReportController);

export default router;
