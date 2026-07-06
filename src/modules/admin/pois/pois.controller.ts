import { Request, Response } from "express";
import path from "path";
import fs from "fs"; // Need fs to delete file on gallery removal
import sharp from "sharp";
import * as poiService from "./pois.service";
import { createPoiSchema, updatePoiSchema } from "./pois.schema";
import {
  POIS_UPLOAD_DIR,
  publicUrlForPoiIcon,
  POIS_GALLERY_UPLOAD_DIR,
  publicUrlForPoiGalleryImage,
} from "../../../lib/upload";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendBadRequest,
  sendValidationError,
  sendServerError,
} from "../../../utils/response";

export const createPoi = async (req: Request, res: Response) => {
  try {
    const data = createPoiSchema.parse(req.body);
    const poi = await poiService.createPoi(data);
    return sendCreated(res, poi, "POI created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    return sendServerError(res, "Failed to create POI");
  }
};

export const getPois = async (req: Request, res: Response) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;
    if (!buildingId) {
      return sendBadRequest(res, "buildingId query parameter is required");
    }
    const floorLevelRaw = req.query.floorLevel as string | undefined;
    const floorLevel =
      floorLevelRaw !== undefined && floorLevelRaw !== ""
        ? Number(floorLevelRaw)
        : undefined;
    if (floorLevel !== undefined && Number.isNaN(floorLevel)) {
      return sendBadRequest(res, "floorLevel must be a number");
    }
    const pois = await poiService.getPois(buildingId, floorLevel);
    return sendSuccess(res, pois);
  } catch (error) {
    return sendServerError(res, "Failed to fetch POIs");
  }
};

export const getPoiById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const poi = await poiService.getPoiById(id);
    if (!poi) {
      return sendNotFound(res, "POI");
    }
    return sendSuccess(res, poi);
  } catch (error) {
    return sendServerError(res, "Failed to fetch POI");
  }
};

export const updatePoi = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updatePoiSchema.parse(req.body);
    const poi = await poiService.updatePoi(id, data);
    return sendSuccess(res, poi, 200, "POI updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "POI");
    }
    return sendServerError(res, "Failed to update POI");
  }
};

export const uploadPoiIcon = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendBadRequest(res, "No file uploaded (use multipart field 'icon')");
    }
    const { id } = req.params;

    const existing = await poiService.getPoiById(id);
    if (!existing) {
      return sendNotFound(res, "POI");
    }

    const filename = `${id}-${Date.now()}.webp`;
    await sharp(req.file.buffer)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toFile(path.join(POIS_UPLOAD_DIR, filename));

    const poi = await poiService.setPoiIcon(id, publicUrlForPoiIcon(filename));
    return sendSuccess(res, poi, 200, "POI icon uploaded");
  } catch (error) {
    return sendServerError(res, "Failed to process POI icon");
  }
};

export const deletePoi = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await poiService.deletePoi(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "POI");
    }
    return sendServerError(res, "Failed to delete POI");
  }
};

export const uploadPoiGalleryImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendBadRequest(res, "No file uploaded (use multipart field 'image')");
    }
    const { id } = req.params;

    const existing = await poiService.getPoiById(id);
    if (!existing) {
      return sendNotFound(res, "POI");
    }

    const filename = `gallery-${id}-${Date.now()}.webp`;
    await sharp(req.file.buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }) // optimized for phones (quality reduced a bit as requested)
      .toFile(path.join(POIS_GALLERY_UPLOAD_DIR, filename));

    const imageUrl = publicUrlForPoiGalleryImage(filename);
    const poi = await poiService.addPoiGalleryImage(id, imageUrl);
    if (!poi) {
      return sendNotFound(res, "POI");
    }
    return sendSuccess(res, poi, 200, "POI gallery image uploaded");
  } catch (error) {
    return sendServerError(res, "Failed to process POI gallery image");
  }
};

export const deletePoiGalleryImage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { url } = req.query; // Accept url in query
    if (!url || typeof url !== "string") {
      return sendBadRequest(res, "Image url query parameter is required");
    }

    const existing = await poiService.getPoiById(id);
    if (!existing) {
      return sendNotFound(res, "POI");
    }

    // Attempt to delete file from disk if it was saved locally
    if (url.includes("/uploads/pois-gallery/")) {
      const filename = url.split("/uploads/pois-gallery/").pop();
      if (filename) {
        const filePath = path.join(POIS_GALLERY_UPLOAD_DIR, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    const poi = await poiService.removePoiGalleryImage(id, url);
    if (!poi) {
      return sendNotFound(res, "POI");
    }
    return sendSuccess(res, poi, 200, "POI gallery image deleted");
  } catch (error) {
    return sendServerError(res, "Failed to delete POI gallery image");
  }
};
