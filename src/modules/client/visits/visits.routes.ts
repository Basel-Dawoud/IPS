import { Router } from "express";
import * as visitController from "./visits.controller";

const router = Router();

router.post("/record", visitController.recordVisit);
router.post("/close", visitController.closeVisit);
router.get("/recent", visitController.getRecentVisits);

export default router;
