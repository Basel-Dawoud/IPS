import { z } from "zod";

const iBeaconSchema = z.object({
  uuid: z.string(),
  major: z.number(),
  minor: z.number(),
  rssi: z.number(),
});

const flexibleBeaconSchema = z.object({
  beaconId: z.string(),
  rssi: z.number(),
});

const beaconReadingSchema = z.union([iBeaconSchema, flexibleBeaconSchema]);

export const positioningSchema = z.object({
  beacons: z.array(beaconReadingSchema).min(1, "At least one beacon reading is required"),
  buildingId: z.string().optional(),
  floorHint: z.number().int().optional(),
  method: z
    .enum(["trilateration", "fingerprint", "probabilistic", "hybrid", "auto"])
    .optional(),
});
