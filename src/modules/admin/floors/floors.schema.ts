import { z } from "zod";

const rotationDegSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

const calibrationFields = {
  // mapUrl is no longer restricted to z.string().url(): it may be a
  // backend-hosted absolute URL produced by the image upload endpoint.
  mapUrl: z.string().optional(),
  widthMeters: z.number().positive().optional(),
  heightMeters: z.number().positive().optional(),
  imageWidthPx: z.number().int().positive().optional(),
  imageHeightPx: z.number().int().positive().optional(),
  metersPerPixel: z.number().positive().optional(),
  rotationDeg: rotationDegSchema.optional(),
  originXm: z.number().optional(),
  originYm: z.number().optional(),
};

export const createFloorSchema = z.object({
  buildingId: z.string().cuid("Invalid Building ID"),
  level: z.number().int(),
  name: z.string().min(1, "Name is required"),
  ...calibrationFields,
});

export const updateFloorSchema = z.object({
  level: z.number().int().optional(),
  name: z.string().min(1).optional(),
  ...calibrationFields,
});
