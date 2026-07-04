import { Request, Response } from "express";
import path from "path";
import sharp from "sharp";
import * as dealService from "./deals.service";
import { createDealSchema, updateDealSchema } from "./deals.schema";
import { DEALS_UPLOAD_DIR, publicUrlForDealImage } from "../../../lib/upload";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendBadRequest,
  sendValidationError,
  sendServerError,
} from "../../../utils/response";

export const createDeal = async (req: Request, res: Response) => {
  try {
    const data = createDealSchema.parse(req.body);
    const deal = await dealService.createDeal(data);
    return sendCreated(res, deal, "Deal created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2003") {
      return sendNotFound(res, "POI");
    }
    return sendServerError(res, "Failed to create deal");
  }
};

export const getDealsByBuilding = async (req: Request, res: Response) => {
  try {
    const { buildingId } = req.params;
    const deals = await dealService.getDealsByBuilding(buildingId);
    return sendSuccess(res, deals);
  } catch (error) {
    return sendServerError(res, "Failed to fetch deals");
  }
};

export const getDealsByPoi = async (req: Request, res: Response) => {
  try {
    const { poiId } = req.params;
    const deals = await dealService.getDealsByPoi(poiId);
    return sendSuccess(res, deals);
  } catch (error) {
    return sendServerError(res, "Failed to fetch deals");
  }
};

export const getDealById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deal = await dealService.getDealById(id);
    if (!deal) {
      return sendNotFound(res, "Deal");
    }
    return sendSuccess(res, deal);
  } catch (error) {
    return sendServerError(res, "Failed to fetch deal");
  }
};

export const updateDeal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateDealSchema.parse(req.body);
    const deal = await dealService.updateDeal(id, data);
    return sendSuccess(res, deal, 200, "Deal updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "Deal");
    }
    return sendServerError(res, "Failed to update deal");
  }
};

export const deleteDeal = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dealService.deleteDeal(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "Deal");
    }
    return sendServerError(res, "Failed to delete deal");
  }
};

export const uploadDealImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendBadRequest(res, "No file uploaded (use multipart field 'image')");
    }
    const { id } = req.params;

    const existing = await dealService.getDealById(id);
    if (!existing) {
      return sendNotFound(res, "Deal");
    }

    // Compress + resize into a web-friendly WebP banner (max 1000px wide).
    const filename = `${id}-${Date.now()}.webp`;
    await sharp(req.file.buffer)
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(DEALS_UPLOAD_DIR, filename));

    const deal = await dealService.setDealImage(id, publicUrlForDealImage(filename));
    return sendSuccess(res, deal, 200, "Deal image uploaded");
  } catch (error) {
    return sendServerError(res, "Failed to process deal image");
  }
};
