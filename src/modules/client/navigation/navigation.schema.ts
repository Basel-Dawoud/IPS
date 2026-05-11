import { z } from "zod";

export const routeSchema = z.object({
  startNodeId: z.string().cuid().optional(),
  endNodeId: z.string().cuid(),
  currentX: z.number().optional(),
  currentY: z.number().optional(),
  currentFloorLevel: z.number().int().optional(),
  buildingId: z.string().cuid(),
});
