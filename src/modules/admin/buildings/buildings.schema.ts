import { z } from "zod";

export const createBuildingSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const updateBuildingSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

// Accepts a GeoJSON Polygon. We validate the outer shape; PostGIS does the
// strict geometry validation (and rejects malformed rings) on write.
const linearRingSchema = z
  .array(z.tuple([z.number(), z.number()]))
  .min(4, "A polygon ring must have at least 4 positions (first = last)");

export const setBuildingZoneSchema = z.object({
  zone: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(linearRingSchema).min(1),
  }),
});
