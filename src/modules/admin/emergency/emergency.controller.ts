import { Request, Response } from "express";
import * as emergencyService from "./emergency.service";
import { triggerEmergencySchema } from "./emergency.schema";
import { sendSuccess, sendServerError, sendValidationError } from "../../../utils/response";

export const getEmergencyState = async (req: Request, res: Response) => {
  try {
    const { buildingId } = req.params;
    const alert = await emergencyService.getEmergencyState(buildingId);
    return sendSuccess(res, alert);
  } catch (error: any) {
    console.error("Error getting emergency state:", error);
    return sendServerError(res, "Failed to get emergency state");
  }
};

export const triggerEmergency = async (req: Request, res: Response) => {
  try {
    const { buildingId } = req.params;
    const input = triggerEmergencySchema.parse(req.body);
    const alert = await emergencyService.triggerEmergency(buildingId, input);

    const io = (req as any).io;
    if (io) {
      io.to(`building_${buildingId}`).emit("emergency_alert", alert);
      console.log(`[Socket.IO] Broadcasted emergency_alert for building ${buildingId}`);
    } else {
      console.warn("[Socket.IO] io instance not found on req");
    }

    return sendSuccess(res, alert);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    console.error("Error triggering emergency:", error);
    return sendServerError(res, "Failed to trigger emergency");
  }
};

export const clearEmergency = async (req: Request, res: Response) => {
  try {
    const { buildingId } = req.params;
    const alert = await emergencyService.clearEmergency(buildingId);

    const io = (req as any).io;
    if (io) {
      io.to(`building_${buildingId}`).emit("emergency_clear", { buildingId });
      console.log(`[Socket.IO] Broadcasted emergency_clear for building ${buildingId}`);
    } else {
      console.warn("[Socket.IO] io instance not found on req");
    }

    return sendSuccess(res, alert);
  } catch (error: any) {
    console.error("Error clearing emergency:", error);
    return sendServerError(res, "Failed to clear emergency");
  }
};
