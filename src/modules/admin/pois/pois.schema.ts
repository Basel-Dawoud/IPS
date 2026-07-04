import { z } from "zod";
import { PoiType } from "../../../generated/prisma/enums";

export const createPoiSchema = z.object({
  buildingId: z.string().cuid("Invalid Building ID"),
  floorLevel: z.number().int(),
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
  type: z.nativeEnum(PoiType),
  iconUrl: z.string().optional(),
  x: z.number(),
  y: z.number(),
  // Optional admin-drawn zone (meters, top-left + size, same frame as x/y).
  areaX: z.number().nullable().optional(),
  areaY: z.number().nullable().optional(),
  areaW: z.number().positive().nullable().optional(),
  areaH: z.number().positive().nullable().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  category: z.string().optional(), // free-text category name (connectOrCreate)
  aliases: z.array(z.string()).optional(),
  productKeywords: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const updatePoiSchema = z.object({
  floorLevel: z.number().int().optional(),
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  type: z.nativeEnum(PoiType).optional(),
  iconUrl: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  // null clears the saved zone (app falls back to the auto-derived one).
  areaX: z.number().nullable().optional(),
  areaY: z.number().nullable().optional(),
  areaW: z.number().positive().nullable().optional(),
  areaH: z.number().positive().nullable().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  category: z.string().optional(), // free-text name; "" disconnects
  aliases: z.array(z.string()).optional(),
  productKeywords: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});
