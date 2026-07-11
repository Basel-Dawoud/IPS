import { z } from "zod";

export const blockedZoneSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  floorLevel: z.number().int(),
});

export const triggerEmergencySchema = z.object({
  gatheringPointId: z.string().nullable().optional(),
  blockedPoiIds: z.array(z.string()).optional(),
  blockedZones: z.array(blockedZoneSchema).optional(),
  message: z.string().optional(),
});

export type BlockedZone = z.infer<typeof blockedZoneSchema>;

