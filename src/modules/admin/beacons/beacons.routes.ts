import { Router } from "express";
import * as beaconController from "./beacons.controller";

const router = Router();

router.post("/", beaconController.createBeacon);
router.get("/building/:buildingId", beaconController.getBeaconsByBuilding);
router.patch("/:id", beaconController.updateBeacon);
router.delete("/:id", beaconController.deleteBeacon);

export default router;
