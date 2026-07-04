import { z } from "zod";

export const chatMessageSchema = z.object({
  buildingId: z.string(),
  message: z.string().min(1).max(500),
  floorLevel: z.coerce.number().int().optional(),
  lastSuggestedPoiId: z.string().optional(),
  sessionId: z.string().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      floor: z.number(),
    })
    .partial()
    .optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
