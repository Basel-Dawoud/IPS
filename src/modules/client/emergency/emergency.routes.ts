import { Router } from "express";
import { getEmergencyState } from "../../admin/emergency/emergency.controller";

const router = Router({ mergeParams: true });

router.get("/", getEmergencyState);

export default router;
