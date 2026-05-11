import { z } from "zod";

export const createBeaconSchema = z.object({
  beaconUid: z.string().min(1, "Beacon UID is required"),
  buildingId: z.string().cuid("Invalid Building ID"),
  floorLevel: z.number().int(),
  x: z.number(),
  y: z.number(),
  txPowerDbm: z.number().optional(),
  refRssi1mDbm: z.number().optional(),
});

export const updateBeaconSchema = z.object({
  beaconUid: z.string().min(1).optional(),
  floorLevel: z.number().int().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  txPowerDbm: z.number().optional(),
  refRssi1mDbm: z.number().optional(),
  active: z.boolean().optional(),
});
