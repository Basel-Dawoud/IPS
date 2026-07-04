import { Router } from "express";
import * as authController from "./auth.controller";
import { requireAuth } from "../../middleware/optional-auth";

const router = Router();

router.post("/google", authController.signInGoogle);
router.post("/apple", authController.signInApple);
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", authController.me);
router.post("/change-password", requireAuth, authController.changePassword);

export default router;
