import { Router } from "express";
import * as recController from "./recommendation.controller";
import { requireAuth } from "../../../middleware/optional-auth";

const router = Router();

// Retrieve recommended POIs based on position, floor, and history (supports anonymous guests)
router.get("/", recController.getRecommendations);

// Track beginning of navigation (requires authenticated user)
router.post("/:poiId/visit", requireAuth, recController.recordVisit);

// Track proximity arrival check (requires authenticated user)
router.post("/:poiId/arrive", requireAuth, recController.recordArrival);

// Submit or update a user rating and review (requires authenticated user)
router.post("/:poiId/reviews", requireAuth, recController.submitReview);

// Retrieve all reviews for a POI (available to guests)
router.get("/:poiId/reviews", recController.getReviews);

export default router;
