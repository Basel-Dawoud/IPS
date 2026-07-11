import { Request, Response } from "express";
import * as ipsService from "./ips.service";
import { sendSuccess, sendServerError } from "../../../utils/response";

export const getGeometry = async (req: Request, res: Response) => {
  try {
    const geometry = await ipsService.getGeometry();
    return sendSuccess(res, geometry);
  } catch (error) {
    console.error("Failed to export IPS geometry:", error);
    return sendServerError(res, "Failed to export IPS geometry");
  }
};
