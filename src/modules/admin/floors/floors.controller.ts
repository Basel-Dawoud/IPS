import { Request, Response } from "express";
import * as floorService from "./floors.service";
import { createFloorSchema, updateFloorSchema } from "./floors.schema";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendValidationError,
  sendServerError,
} from "../../../utils/response";

export const createFloor = async (req: Request, res: Response) => {
  try {
    const data = createFloorSchema.parse(req.body);
    const floor = await floorService.createFloor(data);
    return sendCreated(res, floor, "Floor created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    return sendServerError(res, "Failed to create floor");
  }
};

export const getFloorsByBuilding = async (req: Request, res: Response) => {
  try {
    const { buildingId } = req.params;
    const floors = await floorService.getFloorsByBuilding(buildingId);
    return sendSuccess(res, floors);
  } catch (error) {
    return sendServerError(res, "Failed to fetch floors");
  }
};

export const getFloorById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const floor = await floorService.getFloorById(id);
    if (!floor) {
      return sendNotFound(res, "Floor");
    }
    return sendSuccess(res, floor);
  } catch (error) {
    return sendServerError(res, "Failed to fetch floor");
  }
};

export const updateFloor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateFloorSchema.parse(req.body);
    const floor = await floorService.updateFloor(id, data);
    return sendSuccess(res, floor, 200, "Floor updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "Floor");
    }
    return sendServerError(res, "Failed to update floor");
  }
};

export const deleteFloor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await floorService.deleteFloor(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "Floor");
    }
    return sendServerError(res, "Failed to delete floor");
  }
};
