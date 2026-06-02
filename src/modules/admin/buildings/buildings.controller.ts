import { Request, Response } from "express";
import * as buildingService from "./buildings.service";
import {
  createBuildingSchema,
  setBuildingZoneSchema,
  updateBuildingSchema,
} from "./buildings.schema";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendValidationError,
  sendServerError,
} from "../../../utils/response";

export const createBuilding = async (req: Request, res: Response) => {
  try {
    const data = createBuildingSchema.parse(req.body);
    const building = await buildingService.createBuilding(data);
    return sendCreated(res, building, "Building created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    return sendServerError(res, "Failed to create building");
  }
};

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

export const updateBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateBuildingSchema.parse(req.body);
    const building = await buildingService.updateBuilding(id, data);
    return sendSuccess(res, building, 200, "Building updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "Building");
    }
    return sendServerError(res, "Failed to update building");
  }
};

export const deleteBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await buildingService.deleteBuilding(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "Building");
    }
    return sendServerError(res, "Failed to delete building");
  }
};

export const setBuildingZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { zone } = setBuildingZoneSchema.parse(req.body);
    const affected = await buildingService.setBuildingZone(id, zone);
    if (affected === 0) return sendNotFound(res, "Building");
    return sendSuccess(res, { id, zone }, 200, "Building zone updated");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    console.error("[admin/buildings/zone] failed:", error);
    return sendServerError(res, "Failed to update building zone");
  }
};

export const clearBuildingZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const affected = await buildingService.clearBuildingZone(id);
    if (affected === 0) return sendNotFound(res, "Building");
    return sendNoContent(res);
  } catch (error) {
    return sendServerError(res, "Failed to clear building zone");
  }
};
