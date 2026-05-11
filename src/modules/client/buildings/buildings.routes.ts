import { Router } from "express";
import * as buildingController from "./buildings.controller";

const router = Router();

router.get("/", buildingController.getBuildings);
router.get("/:id", buildingController.getBuildingById);

export default router;
