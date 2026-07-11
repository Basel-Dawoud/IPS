import { Router } from "express";
import * as floorController from "./floors.controller";
import { floorImageUpload } from "../../../lib/upload";

const router = Router();

router.post("/", floorController.createFloor);
router.get("/building/:buildingId", floorController.getFloorsByBuilding);
router.get("/:id", floorController.getFloorById);
router.patch("/:id", floorController.updateFloor);
router.post("/:id/image", floorImageUpload.single("image"), floorController.uploadFloorImage);
router.post("/:id/detect-transitions", floorController.detectTransitions);
router.delete("/:id", floorController.deleteFloor);

export default router;
