import { Request, Response } from "express";
import * as visitService from "./visits.service";
import {
  sendSuccess,
  sendCreated,
  sendServerError,
  sendValidationError,
} from "../../../utils/response";
import { z } from "zod";

const recordSchema = z.object({
  buildingId: z.string().cuid("Invalid Building ID"),
  poiId: z.string().cuid("Invalid POI ID").optional(),
});

export const recordVisit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const { buildingId, poiId } = recordSchema.parse(req.body);
    const result = await visitService.recordBuildingVisit(userId, buildingId, poiId);
    return sendCreated(res, result, result.alreadyOpen ? "Visit already open" : "Visit recorded");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    console.error("[client/visits/record] failed:", error);
    return sendServerError(res, "Failed to record visit");
  }
};

export const closeVisit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const { buildingId } = recordSchema.parse(req.body);
    await visitService.closeBuildingVisit(userId, buildingId);
    return sendSuccess(res, null, 200, "Visit closed");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    console.error("[client/visits/close] failed:", error);
    return sendServerError(res, "Failed to close visit");
  }
};

export const getRecentVisits = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    const limit = parseInt(req.query.limit as string) || 5;
    const visits = await visitService.getRecentBuildingVisits(userId, limit);
    return sendSuccess(res, visits);
  } catch (error) {
    console.error("[client/visits/recent] failed:", error);
    return sendServerError(res, "Failed to fetch recent visits");
  }
};
