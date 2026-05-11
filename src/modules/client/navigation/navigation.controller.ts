import { Request, Response } from "express";
import * as navigationService from "./navigation.service";
import { routeSchema } from "./navigation.schema";
import {
  sendSuccess,
  sendValidationError,
  sendError,
  sendServerError,
} from "../../../utils/response";

export const getRoute = async (req: Request, res: Response) => {
  try {
    const data = routeSchema.parse(req.body);
    const result = await navigationService.calculateRoute(data);
    return sendSuccess(res, result);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.message) {
      return sendError(res, error.message, 400);
    }
    return sendServerError(res, "Failed to calculate route");
  }
};
