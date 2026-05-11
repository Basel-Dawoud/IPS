import { Request, Response } from "express";
import * as positioningService from "./positioning.service";
import { positioningSchema } from "./positioning.schema";
import {
  sendSuccess,
  sendValidationError,
  sendError,
  sendServerError,
} from "../../../utils/response";

export const locate = async (req: Request, res: Response) => {
  try {
    const data = positioningSchema.parse(req.body);
    const result = await positioningService.calculatePosition(data);
    return sendSuccess(res, result);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.message?.includes("No known beacons")) {
      return sendError(res, error.message, 400);
    }
    if (error.message?.includes("Not enough")) {
      return sendError(res, error.message, 400);
    }
    if (error.message?.includes("No fingerprint data")) {
      return sendError(res, error.message, 400);
    }
    if (error.message?.includes("Could not determine position")) {
      return sendError(res, error.message, 400);
    }
    console.error("Positioning error:", error);
    return sendServerError(res, "Failed to calculate position");
  }
};
