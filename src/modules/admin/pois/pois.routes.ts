import { Router } from "express";
import * as poiController from "./pois.controller";
import { poiIconUpload } from "../../../lib/upload";

const router = Router();

router.post("/", poiController.createPoi);
router.get("/", poiController.getPois); // ?buildingId=&floorLevel=
router.get("/:id", poiController.getPoiById);
router.patch("/:id", poiController.updatePoi);
router.post("/:id/icon", poiIconUpload.single("icon"), poiController.uploadPoiIcon);
router.delete("/:id", poiController.deletePoi);

export default router;
