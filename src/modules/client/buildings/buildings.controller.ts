import { Request, Response } from "express";
import * as buildingService from "./buildings.service";
import { nearbyQuerySchema } from "./buildings.schema";
import {
  sendSuccess,
  sendNotFound,
  sendServerError,
  sendValidationError,
} from "../../../utils/response";

export const getBuildings = async (req: Request, res: Response) => {
  try {
    const buildings = await buildingService.getBuildings();
    return sendSuccess(res, buildings);
  } catch (error) {
    return sendServerError(res, "Failed to fetch buildings");
  }
};

export const getBuildingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const building = await buildingService.getBuildingById(id);
    if (!building) {
      return sendNotFound(res, "Building");
    }
    return sendSuccess(res, building);
  } catch (error) {
    return sendServerError(res, "Failed to fetch building");
  }
};

export const getNearbyBuildings = async (req: Request, res: Response) => {
  try {
    const { lat, lng, radiusMeters } = nearbyQuerySchema.parse(req.query);
    const rows = await buildingService.getNearbyBuildings(lat, lng, radiusMeters);
    return sendSuccess(res, rows);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    console.error("[buildings/nearby] failed:", error);
    return sendServerError(res, "Failed to fetch nearby buildings");
  }
};
