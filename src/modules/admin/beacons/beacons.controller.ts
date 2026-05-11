import { Request, Response } from "express";
import * as beaconService from "./beacons.service";
import { createBeaconSchema, updateBeaconSchema } from "./beacons.schema";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendValidationError,
  sendServerError,
  sendError,
} from "../../../utils/response";

export const createBeacon = async (req: Request, res: Response) => {
  try {
    const data = createBeaconSchema.parse(req.body);
    const beacon = await beaconService.createBeacon(data);
    return sendCreated(res, beacon, "Beacon created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2002") {
      return sendError(
        res,
        "A beacon with this UID is already registered. Delete the existing beacon first.",
        409
      );
    }
    return sendServerError(res, "Failed to create beacon");
  }
};

export const getBeaconsByBuilding = async (req: Request, res: Response) => {
  try {
    const { buildingId } = req.params;
    const beacons = await beaconService.getBeaconsByBuilding(buildingId);
    return sendSuccess(res, beacons);
  } catch (error) {
    return sendServerError(res, "Failed to fetch beacons");
  }
};

export const updateBeacon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateBeaconSchema.parse(req.body);
    const beacon = await beaconService.updateBeacon(id, data);
    return sendSuccess(res, beacon, 200, "Beacon updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "Beacon");
    }
    return sendServerError(res, "Failed to update beacon");
  }
};

export const deleteBeacon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await beaconService.deleteBeacon(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "Beacon");
    }
    return sendServerError(res, "Failed to delete beacon");
  }
};
