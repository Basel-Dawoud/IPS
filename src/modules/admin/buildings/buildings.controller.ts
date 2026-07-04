import { Request, Response } from "express";
import path from "path";
import sharp from "sharp";
import * as buildingService from "./buildings.service";
import { BUILDINGS_UPLOAD_DIR, publicUrlForBuildingImage } from "../../../lib/upload";
import {
  createBuildingSchema,
  setBuildingZoneSchema,
  updateBuildingSchema,
} from "./buildings.schema";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendValidationError,
  sendServerError,
  sendBadRequest,
} from "../../../utils/response";

export const createBuilding = async (req: Request, res: Response) => {
  try {
    const data = createBuildingSchema.parse(req.body);
    const building = await buildingService.createBuilding(data);
    return sendCreated(res, building, "Building created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    return sendServerError(res, "Failed to create building");
  }
};

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

export const updateBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateBuildingSchema.parse(req.body);
    const building = await buildingService.updateBuilding(id, data);
    return sendSuccess(res, building, 200, "Building updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "Building");
    }
    return sendServerError(res, "Failed to update building");
  }
};

export const deleteBuilding = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await buildingService.deleteBuilding(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "Building");
    }
    return sendServerError(res, "Failed to delete building");
  }
};

export const setBuildingZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { zone } = setBuildingZoneSchema.parse(req.body);
    const affected = await buildingService.setBuildingZone(id, zone);
    if (affected === 0) return sendNotFound(res, "Building");
    return sendSuccess(res, { id, zone }, 200, "Building zone updated");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    console.error("[admin/buildings/zone] failed:", error);
    return sendServerError(res, "Failed to update building zone");
  }
};

export const clearBuildingZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const affected = await buildingService.clearBuildingZone(id);
    if (affected === 0) return sendNotFound(res, "Building");
    return sendNoContent(res);
  } catch (error) {
    return sendServerError(res, "Failed to clear building zone");
  }
};

export const uploadBuildingImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendBadRequest(res, "No file uploaded (use multipart field 'image')");
    }
    const { id } = req.params;

    const existing = await buildingService.getBuildingById(id);
    if (!existing) {
      return sendNotFound(res, "Building");
    }

    // Process building image: resize to 800x600 webp
    const filename = `${id}-${Date.now()}.webp`;
    await sharp(req.file.buffer)
      .resize(800, 600, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(BUILDINGS_UPLOAD_DIR, filename));

    const imageUrl = publicUrlForBuildingImage(filename);
    const building = await buildingService.updateBuilding(id, { imageUrl });

    return sendSuccess(res, building, 200, "Building image uploaded");
  } catch (error) {
    console.error("[admin/buildings/image] failed:", error);
    return sendServerError(res, "Failed to process building image");
  }
};
