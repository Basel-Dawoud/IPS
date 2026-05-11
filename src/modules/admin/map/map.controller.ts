import { Request, Response } from "express";
import * as mapService from "./map.service";
import { createNodeSchema, createEdgeSchema } from "./map.schema";
import {
  sendSuccess,
  sendCreated,
  sendValidationError,
  sendServerError,
} from "../../../utils/response";

export const createNode = async (req: Request, res: Response) => {
  try {
    const data = createNodeSchema.parse(req.body);
    const node = await mapService.createNode(data);
    return sendCreated(res, node, "Node created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    return sendServerError(res, "Failed to create node");
  }
};

export const createEdge = async (req: Request, res: Response) => {
  try {
    const data = createEdgeSchema.parse(req.body);
    const edge = await mapService.createEdge(data);
    return sendCreated(res, edge, "Edge created successfully");
  } catch (error: any) {
    if (error.name === "ZodError") {
      return sendValidationError(res, error.errors);
    }
    return sendServerError(res, "Failed to create edge");
  }
};

export const getNodesByFloor = async (req: Request, res: Response) => {
  try {
    const { buildingId, floorLevel } = req.params;
    const nodes = await mapService.getNodesByFloor(buildingId, parseInt(floorLevel));
    return sendSuccess(res, nodes);
  } catch (error) {
    return sendServerError(res, "Failed to fetch nodes");
  }
};
