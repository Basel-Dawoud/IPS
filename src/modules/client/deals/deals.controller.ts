import { Request, Response } from "express";
import * as dealService from "./deals.service";
import {
  sendSuccess,
  sendNotFound,
  sendServerError,
  sendValidationError,
} from "../../../utils/response";
import { z } from "zod";

const querySchema = z.object({
  buildingId: z.string().optional(),
  buildingIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : [])),
});

export const getDeals = async (req: Request, res: Response) => {
  try {
    const { buildingId, buildingIds } = querySchema.parse(req.query);

    if (buildingId) {
      const deals = await dealService.getActiveDealsForBuilding(buildingId);
      return sendSuccess(res, deals);
    }

    if (buildingIds && buildingIds.length > 0) {
      const deals = await dealService.getHotDealsNearby(buildingIds);
      return sendSuccess(res, deals);
    }

    return sendSuccess(res, []);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    console.error("[client/deals] failed:", error);
    return sendServerError(res, "Failed to fetch deals");
  }
};

export const getDeal = async (req: Request, res: Response) => {
  try {
    const deal = await dealService.getDealById(req.params.id);
    if (!deal) return sendNotFound(res, "Deal");
    return sendSuccess(res, deal);
  } catch (error) {
    console.error("[client/deals/:id] failed:", error);
    return sendServerError(res, "Failed to fetch deal");
  }
};
