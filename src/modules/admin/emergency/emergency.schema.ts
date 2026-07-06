import { z } from "zod";

export const triggerEmergencySchema = z.object({
  gatheringPointId: z.string().cuid("Invalid Gathering Point POI ID").nullable().optional(),
  blockedPoiIds: z.array(z.string()).optional(),
  message: z.string().optional(),
});
