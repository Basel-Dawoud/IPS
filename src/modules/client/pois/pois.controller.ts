import { Request, Response } from "express";
import * as poiService from "../../admin/pois/pois.service";
import { sendSuccess, sendBadRequest, sendServerError } from "../../../utils/response";

// Read-only POI listing for the client app (search + map points). Reuses the
// admin service; only returns active POIs.
export const getPois = async (req: Request, res: Response) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;
    if (!buildingId) {
      return sendBadRequest(res, "buildingId query parameter is required");
    }
    const floorLevelRaw = req.query.floorLevel as string | undefined;
    const floorLevel =
      floorLevelRaw !== undefined && floorLevelRaw !== "" ? Number(floorLevelRaw) : undefined;
    if (floorLevel !== undefined && Number.isNaN(floorLevel)) {
      return sendBadRequest(res, "floorLevel must be a number");
    }
    const pois = await poiService.getPois(buildingId, floorLevel);
    return sendSuccess(
      res,
      pois.filter((p) => p.active),
    );
  } catch (error) {
    return sendServerError(res, "Failed to fetch POIs");
  }
};
