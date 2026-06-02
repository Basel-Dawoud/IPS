import { Router } from "express";
import * as wifiApController from "./wifi-aps.controller";

const router = Router();

router.post("/", wifiApController.createWifiAp);
router.get("/building/:buildingId", wifiApController.getWifiApsByBuilding);
router.patch("/:id", wifiApController.updateWifiAp);
router.delete("/:id", wifiApController.deleteWifiAp);

export default router;
