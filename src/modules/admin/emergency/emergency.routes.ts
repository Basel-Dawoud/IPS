import { Router } from "express";
import * as emergencyController from "./emergency.controller";

const router = Router({ mergeParams: true });

router.get("/", emergencyController.getEmergencyState);
router.post("/", emergencyController.triggerEmergency);
router.post("/clear", emergencyController.clearEmergency);

export default router;
