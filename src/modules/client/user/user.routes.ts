import { Router } from "express";
import * as userController from "./user.controller";
import { requireAuth } from "../../../middleware/optional-auth";
import { avatarImageUpload } from "../../../lib/upload";

const router = Router();

// Retrieve all selectable POI categories for onboarding
router.get("/categories", userController.getCategories);

// Save onboarding interests selection (requires auth)
router.patch("/interests", requireAuth, userController.saveInterests);

// Skip onboarding screen (requires auth)
router.patch("/skip-onboarding", requireAuth, userController.skipOnboarding);

// Update profile fields — name / age / gender (requires auth)
router.patch("/profile", requireAuth, userController.updateProfile);

// Upload/replace the profile avatar (requires auth, multipart field 'image')
router.post("/avatar", requireAuth, avatarImageUpload.single("image"), userController.uploadAvatar);

// Recently visited POIs for the signed-in user (requires auth)
router.get("/recent-visits", requireAuth, userController.getRecentVisits);

// Clear the signed-in user's visit history (requires auth)
router.delete("/recent-visits", requireAuth, userController.clearRecentVisits);

// Delete the signed-in user's account (requires auth)
router.delete("/", requireAuth, userController.deleteAccount);

export default router;
