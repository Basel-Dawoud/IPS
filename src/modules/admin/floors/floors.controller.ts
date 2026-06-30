import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { imageSize } from "image-size";
import * as floorService from "./floors.service";
import { createFloorSchema, updateFloorSchema } from "./floors.schema";
import { publicUrlForFloorImage } from "../../../lib/upload";
import { parseNpy, renderGridPng } from "../../../lib/npy";
import { vectorizeGrid } from "../../../lib/grid-vectorize";
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendBadRequest,
  sendValidationError,
  sendServerError,
} from "../../../utils/response";

export const createFloor = async (req: Request, res: Response) => {
  try {
    const data = createFloorSchema.parse(req.body);
    const floor = await floorService.createFloor(data);
    return sendCreated(res, floor, "Floor created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    return sendServerError(res, "Failed to create floor");
  }
};

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

export const updateFloor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateFloorSchema.parse(req.body);
    const floor = await floorService.updateFloor(id, data);
    return sendSuccess(res, floor, 200, "Floor updated successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    if (error.code === "P2025") {
      return sendNotFound(res, "Floor");
    }
    return sendServerError(res, "Failed to update floor");
  }
};

// POST /:id/image — multipart "image". Accepts a plan image (PNG/JPEG/WebP) OR
// a NumPy `.npy` occupancy grid. For `.npy` we parse it and render a PNG (one
// pixel per cell). Either way we then read the PNG's pixel dimensions and store
// the URL + dimensions on the floor (scale/rotation are set separately via PATCH).
export const uploadFloorImage = async (req: Request, res: Response) => {
  const file = req.file;
  try {
    if (!file) {
      return sendBadRequest(res, "No file uploaded (use multipart field 'image')");
    }
    const { id } = req.params;

    const existing = await floorService.getFloorById(id);
    if (!existing) {
      fs.unlink(file.path, () => {});
      return sendNotFound(res, "Floor");
    }

    // Resolve to a PNG on disk: render it from the grid if a .npy was uploaded,
    // and (for grids) also derive the vector floor map.
    let pngPath = file.path;
    let pngFilename = file.filename;
    let vectorMap: unknown = undefined;
    if (path.extname(file.filename).toLowerCase() === ".npy") {
      try {
        const grid = parseNpy(fs.readFileSync(file.path));
        const pngBuffer = renderGridPng(grid);
        pngFilename = file.filename.replace(/\.npy$/i, ".png");
        pngPath = path.join(path.dirname(file.path), pngFilename);
        fs.writeFileSync(pngPath, pngBuffer);
        vectorMap = vectorizeGrid(grid);
      } finally {
        fs.unlink(file.path, () => {}); // drop the raw .npy
      }
    }

    const dim = imageSize(fs.readFileSync(pngPath));
    if (!dim.width || !dim.height) {
      fs.unlink(pngPath, () => {});
      return sendBadRequest(res, "Could not read image dimensions");
    }

    const floor = await floorService.setFloorImage(id, {
      mapUrl: publicUrlForFloorImage(pngFilename),
      imageWidthPx: dim.width,
      imageHeightPx: dim.height,
      vectorMap,
    });
    return sendSuccess(res, floor, 200, "Floor image uploaded");
  } catch (error) {
    if (file) fs.unlink(file.path, () => {});
    return sendServerError(res, "Failed to process floor image");
  }
};

export const deleteFloor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await floorService.deleteFloor(id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") {
      return sendNotFound(res, "Floor");
    }
    return sendServerError(res, "Failed to delete floor");
  }
};
