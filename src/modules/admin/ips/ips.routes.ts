import { Router } from "express";
import * as ipsController from "./ips.controller";

const router = Router();

router.get("/geometry", ipsController.getGeometry);

export default router;
