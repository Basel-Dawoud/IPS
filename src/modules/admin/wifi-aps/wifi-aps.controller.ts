import { Request, Response } from "express";
import * as wifiApService from "./wifi-aps.service";
import { createWifiApSchema, updateWifiApSchema } from "./wifi-aps.schema";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendValidationError,
  sendServerError,
  sendError,
} from "../../../utils/response";

export const createWifiAp = async (req: Request, res: Response) => {
  try {
    const data = createWifiApSchema.parse(req.body);
    const ap = await wifiApService.createWifiAp(data);
    return sendCreated(res, ap, "WiFi AP registered successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2002") {
      return sendError(
        res,
        "An AP with this BSSID is already registered for this building.",
        409
      );
    }
    return sendServerError(res, "Failed to register WiFi AP");
  }
};

export const getWifiApsByBuilding = async (req: Request, res: Response) => {
  try {
    const { buildingId } = req.params;
    const aps = await wifiApService.getWifiApsByBuilding(buildingId);
    return sendSuccess(res, aps);
  } catch (error) {
    return sendServerError(res, "Failed to fetch WiFi APs");
  }
};

export const updateWifiAp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateWifiApSchema.parse(req.body);
    const ap = await wifiApService.updateWifiAp(id, data);
    return sendSuccess(res, ap, 200, "WiFi AP updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "WiFi AP");
    }
    return sendServerError(res, "Failed to update WiFi AP");
  }
};

export const deleteWifiAp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await wifiApService.deleteWifiAp(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "WiFi AP");
    }
    return sendServerError(res, "Failed to delete WiFi AP");
  }
};
