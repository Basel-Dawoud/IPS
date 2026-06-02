import { Router } from "express";
import * as TrajectoryController from "./trajectory.controller";

const router = Router();

/**
 * Trajectory session management
 */
router.post("/sessions", TrajectoryController.createSession);
router.get("/sessions", TrajectoryController.listSessions);
router.get("/sessions/:id", TrajectoryController.getSession);
router.patch("/sessions/:id", TrajectoryController.updateSession);
router.delete("/sessions/:id", TrajectoryController.deleteSession);

/**
 * Walk upload + raw export for the AI team
 */
router.post("/sessions/:id/walks", TrajectoryController.uploadWalks);
router.get("/sessions/:id/export", TrajectoryController.exportSession);
router.get("/sessions/:id/replay", TrajectoryController.replaySession);

export default router;
