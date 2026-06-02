import { Router } from "express";
import * as buildingController from "./buildings.controller";

const router = Router();

// /nearby must be registered before /:id so it isn't shadowed by the param route.
router.get("/nearby", buildingController.getNearbyBuildings);
router.get("/", buildingController.getBuildings);
router.get("/:id", buildingController.getBuildingById);

export default router;
