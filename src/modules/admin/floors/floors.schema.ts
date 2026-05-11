import { z } from "zod";

export const createFloorSchema = z.object({
  buildingId: z.string().cuid("Invalid Building ID"),
  level: z.number().int(),
  name: z.string().min(1, "Name is required"),
  mapUrl: z.string().url().optional(),
});

export const updateFloorSchema = z.object({
  level: z.number().int().optional(),
  name: z.string().min(1).optional(),
  mapUrl: z.string().url().optional(),
});
