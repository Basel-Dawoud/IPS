import { Router } from "express";
import * as poiController from "./pois.controller";

const router = Router();

router.post("/", poiController.createPoi);
router.get("/", poiController.getPois); // ?buildingId=&floorLevel=
router.get("/:id", poiController.getPoiById);
router.patch("/:id", poiController.updatePoi);
router.delete("/:id", poiController.deletePoi);

export default router;
