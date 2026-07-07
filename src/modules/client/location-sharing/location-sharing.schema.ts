import { z } from "zod";

export const createShareSchema = z.object({
  buildingId: z.string().cuid().optional(),
  // 15 min / 1 h presets, or null = "until stopped".
  durationMin: z.union([z.literal(15), z.literal(60), z.null()]),
});

export const acceptInviteSchema = z.object({
  tokenOrCode: z.string().trim().min(4).max(64),
});

export const publishPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  floorLevel: z.number().int(),
  buildingId: z.string().min(1),
});

export type CreateShareInput = z.infer<typeof createShareSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type PublishPositionInput = z.infer<typeof publishPositionSchema>;
