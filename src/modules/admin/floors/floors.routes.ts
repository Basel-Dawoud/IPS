import { Router } from "express";
import * as floorController from "./floors.controller";

const router = Router();

router.post("/", floorController.createFloor);
router.get("/building/:buildingId", floorController.getFloorsByBuilding);
router.get("/:id", floorController.getFloorById);
router.patch("/:id", floorController.updateFloor);
router.delete("/:id", floorController.deleteFloor);

export default router;
