import { Router } from "express";
import * as mapController from "./map.controller";

const router = Router();

router.post("/nodes", mapController.createNode);
router.post("/edges", mapController.createEdge);
router.get("/nodes/:buildingId/:floorLevel", mapController.getNodesByFloor);

export default router;
