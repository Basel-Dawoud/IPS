import { Router } from "express";
import * as positioningController from "./positioning.controller";

const router = Router();

router.post("/locate", positioningController.locate);

export default router;
