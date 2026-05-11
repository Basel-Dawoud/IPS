import { Request, Response } from "express";
import * as buildingService from "./buildings.service";
import { sendSuccess, sendNotFound, sendServerError } from "../../../utils/response";

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
