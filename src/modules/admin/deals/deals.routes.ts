import { Router } from "express";
import * as dealController from "./deals.controller";
import { dealImageUpload } from "../../../lib/upload";

const router = Router();

router.post("/", dealController.createDeal);
router.get("/building/:buildingId", dealController.getDealsByBuilding);
router.get("/poi/:poiId", dealController.getDealsByPoi);
router.get("/:id", dealController.getDealById);
router.patch("/:id", dealController.updateDeal);
router.post("/:id/image", dealImageUpload.single("image"), dealController.uploadDealImage);
router.delete("/:id", dealController.deleteDeal);

export default router;
