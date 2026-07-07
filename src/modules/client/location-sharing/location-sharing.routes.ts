import { Router } from "express";
import { requireAuth } from "../../../middleware/optional-auth";
import * as controller from "./location-sharing.controller";

const router = Router();

// One-off live-location shares. Resolving a token is public — the
// unguessable token IS the permission (like a Google Maps share link).
router.post("/shares", requireAuth, controller.createShare);
router.get("/shares/:token", controller.getShare);
router.delete("/shares/:token", requireAuth, controller.stopShare);

export default router;
