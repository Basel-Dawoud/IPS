import { Router } from "express";
import { requireAuth } from "../../../middleware/optional-auth";
import * as controller from "./location-sharing.controller";

const router = Router();

router.get("/", requireAuth, controller.listFriends);
router.post("/invites", requireAuth, controller.createInvite);
router.get("/invites/:token", controller.getInvite); // public: show who's inviting
router.post("/invites/accept", requireAuth, controller.acceptInvite);
router.delete("/:userId", requireAuth, controller.removeFriend);

export default router;
