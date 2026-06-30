import { Router } from "express";
import * as poiController from "./pois.controller";

const router = Router();

router.get("/", poiController.getPois); // ?buildingId=&floorLevel=

export default router;
