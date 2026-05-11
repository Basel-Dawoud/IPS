import { Router } from "express";
import * as floorController from "./floors.controller";

const router = Router();

router.get("/building/:buildingId", floorController.getFloorsByBuilding);
router.get("/:id", floorController.getFloorById);

export default router;
