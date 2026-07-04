import { Router } from "express";
import * as buildingController from "./buildings.controller";
import { buildingImageUpload } from "../../../lib/upload";

const router = Router();

router.post("/", buildingController.createBuilding);
router.get("/", buildingController.getBuildings);
router.get("/:id", buildingController.getBuildingById);
router.patch("/:id", buildingController.updateBuilding);
router.post("/:id/image", buildingImageUpload.single("image"), buildingController.uploadBuildingImage);
router.delete("/:id", buildingController.deleteBuilding);
router.put("/:id/zone", buildingController.setBuildingZone);
router.delete("/:id/zone", buildingController.clearBuildingZone);

export default router;
