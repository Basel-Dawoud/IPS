import { Router } from "express";
import * as buildingController from "./buildings.controller";

const router = Router();

router.post("/", buildingController.createBuilding);
router.get("/", buildingController.getBuildings);
router.get("/:id", buildingController.getBuildingById);
router.patch("/:id", buildingController.updateBuilding);
router.delete("/:id", buildingController.deleteBuilding);

export default router;
