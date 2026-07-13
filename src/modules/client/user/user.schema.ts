import { z } from "zod";

// Profile edit — every field optional so the client can PATCH just what changed.
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  age: z.number().int().positive().max(120).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  needsStepFree: z.boolean().optional(),
  shareWithFriends: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createFeedbackSchema = z.object({
  type: z.enum(["BUG", "FEATURE", "SUGGESTION"]),
  description: z.string().trim().min(1).max(5000),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
