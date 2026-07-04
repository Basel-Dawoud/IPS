import { Request, Response } from "express";
import prisma from "../../../lib/prisma";
import * as recService from "./recommendation.service";
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendServerError,
} from "../../../utils/response";

export const getRecommendations = async (req: Request, res: Response) => {
  try {
    // buildingId is optional: when present → location-aware recs for that
    // building; when absent → global recommendations across all buildings.
    const buildingId = (req.query.buildingId as string | undefined) || undefined;

    const userId = req.user?.id; // from optionalAuth middleware

    const xRaw = req.query.x as string | undefined;
    const yRaw = req.query.y as string | undefined;
    const floorRaw = req.query.floor as string | undefined;

    const x = xRaw !== undefined ? Number(xRaw) : undefined;
    const y = yRaw !== undefined ? Number(yRaw) : undefined;
    const floor = floorRaw !== undefined ? Number(floorRaw) : undefined;

    const recommendations = await recService.getRecommendations({
      userId,
      buildingId,
      x,
      y,
      floor,
    });

    return sendSuccess(res, recommendations);
  } catch (error: any) {
    console.error("[recommendation.controller] getRecommendations error:", error);
    return sendServerError(res, "Failed to get recommendations");
  }
};

export const recordVisit = async (req: Request, res: Response) => {
  try {
    const { poiId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Authentication required to record visit", 401);
    }

    const poi = await prisma.poi.findUnique({ where: { id: poiId } });
    if (!poi) {
      return sendNotFound(res, "POI");
    }

    // Create a visit log (confirmed = false)
    const visit = await prisma.poiVisit.create({
      data: {
        userId,
        poiId,
        buildingId: poi.buildingId,
        confirmed: false,
      },
    });

    // Increment POI visit count
    await prisma.poi.update({
      where: { id: poiId },
      data: {
        visitCount: { increment: 1 },
      },
    });

    return sendSuccess(res, { success: true, visitId: visit.id });
  } catch (error: any) {
    console.error("[recommendation.controller] recordVisit error:", error);
    return sendServerError(res, "Failed to record visit");
  }
};

export const recordArrival = async (req: Request, res: Response) => {
  try {
    const { poiId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return sendError(res, "Authentication required to confirm arrival", 401);
    }

    const poi = await prisma.poi.findUnique({ where: { id: poiId } });
    if (!poi) {
      return sendNotFound(res, "POI");
    }

    // Find the latest unconfirmed visit for this user & POI, or create a new confirmed one
    const latestUnconfirmed = await prisma.poiVisit.findFirst({
      where: { userId, poiId, confirmed: false },
      orderBy: { createdAt: "desc" },
    });

    if (latestUnconfirmed) {
      await prisma.poiVisit.update({
        where: { id: latestUnconfirmed.id },
        data: { confirmed: true },
      });
    } else {
      // Create new confirmed visit
      await prisma.poiVisit.create({
        data: {
          userId,
          poiId,
          buildingId: poi.buildingId,
          confirmed: true,
        },
      });

      // Increment POI visit count since we skipped the start_visit step
      await prisma.poi.update({
        where: { id: poiId },
        data: {
          visitCount: { increment: 1 },
        },
      });
    }

    return sendSuccess(res, { success: true, arrived: true });
  } catch (error: any) {
    console.error("[recommendation.controller] recordArrival error:", error);
    return sendServerError(res, "Failed to record arrival");
  }
};

export const getReviews = async (req: Request, res: Response) => {
  try {
    const { poiId } = req.params;
    const reviews = await prisma.poiReview.findMany({
      where: { poiId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });

    return sendSuccess(res, reviews);
  } catch (error: any) {
    console.error("[recommendation.controller] getReviews error:", error);
    return sendServerError(res, "Failed to fetch reviews");
  }
};

export const submitReview = async (req: Request, res: Response) => {
  try {
    const { poiId } = req.params;
    const userId = req.user?.id;
    const { rating, comment } = req.body;

    if (!userId) {
      return sendError(res, "Authentication required to submit review", 401);
    }

    if (rating === undefined || rating < 1 || rating > 5) {
      return sendBadRequest(res, "Rating is required and must be between 1 and 5");
    }

    // Upsert the review
    await prisma.poiReview.upsert({
      where: { userId_poiId: { userId, poiId } },
      update: { rating, comment },
      create: { userId, poiId, rating, comment },
    });

    // Recalculate average rating & review count for the POI
    const aggregates = await prisma.poiReview.aggregate({
      where: { poiId },
      _avg: { rating: true },
      _count: { id: true },
    });

    await prisma.poi.update({
      where: { id: poiId },
      data: {
        avgRating: aggregates._avg.rating || 0,
        reviewCount: aggregates._count.id || 0,
      },
    });

    return sendSuccess(res, {
      success: true,
      avgRating: aggregates._avg.rating || 0,
      reviewCount: aggregates._count.id || 0,
    });
  } catch (error: any) {
    console.error("[recommendation.controller] submitReview error:", error);
    return sendServerError(res, "Failed to submit review");
  }
};

// Helper for authentication error inside controller (Express requires specific response status)
function sendError(res: Response, message: string, status: number) {
  return res.status(status).json({
    success: false,
    error: message,
  });
}
