import { Request, Response } from "express";
import * as floorService from "./floors.service";
import { sendSuccess, sendNotFound, sendServerError } from "../../../utils/response";

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
