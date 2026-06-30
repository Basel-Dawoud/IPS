import { z } from "zod";
import { PoiType } from "../../../generated/prisma/enums";

export const createPoiSchema = z.object({
  buildingId: z.string().cuid("Invalid Building ID"),
  floorLevel: z.number().int(),
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),
  type: z.nativeEnum(PoiType),
  x: z.number(),
  y: z.number(),
  description: z.string().optional(),
  category: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  productKeywords: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const updatePoiSchema = z.object({
  floorLevel: z.number().int().optional(),
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  type: z.nativeEnum(PoiType).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  productKeywords: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});
