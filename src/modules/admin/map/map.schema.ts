import { z } from "zod";
import { MapNodeType } from "../../../generated/prisma/enums";

export const createNodeSchema = z.object({
  buildingId: z.string().cuid(),
  floorLevel: z.number().int(),
  x: z.number(),
  y: z.number(),
  type: z.nativeEnum(MapNodeType),
  poiId: z.string().cuid().optional(),
});

export const createEdgeSchema = z.object({
  fromNodeId: z.string().cuid(),
  toNodeId: z.string().cuid(),
  cost: z.number().positive().optional(),
  bidirectional: z.boolean().optional(),
});
