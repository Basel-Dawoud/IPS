import { Router } from "express";
import * as dealController from "./deals.controller";

const router = Router();

router.get("/", dealController.getDeals);
router.get("/:id", dealController.getDeal);

export default router;
