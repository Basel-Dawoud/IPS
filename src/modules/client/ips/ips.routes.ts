import { Router } from "express";
import * as ipsController from "../../admin/ips/ips.controller";

// Public geometry export for the IPS analytics plane (FastAPI syncs from here).
// Lives under /api/client (unauthenticated) because the production backend
// guards all /api/admin routes, and this is the same buildings/floors/POI
// data already served publicly to the mobile app.
const router = Router();

router.get("/geometry", ipsController.getGeometry);

export default router;
