import { Router } from "express";
import * as chatSessionController from "./chat-session.controller";
import { requireAuth } from "../../../middleware/optional-auth";

const router = Router();

router.use(requireAuth);

router.get("/", chatSessionController.getSessions);
router.get("/:id/messages", chatSessionController.getSessionMessages);
router.delete("/:id", chatSessionController.deleteSession);

export default router;
