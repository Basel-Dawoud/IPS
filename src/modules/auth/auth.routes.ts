import { Router } from "express";
import * as authController from "./auth.controller";

const router = Router();

router.post("/google", authController.signInGoogle);
router.post("/apple", authController.signInApple);
router.get("/me", authController.me);

export default router;
