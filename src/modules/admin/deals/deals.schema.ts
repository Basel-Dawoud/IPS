import { z } from "zod";

export const createDealSchema = z.object({
  poiId: z.string().cuid("Invalid POI ID"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  discountPct: z.number().int().min(1).max(100).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  active: z.boolean().optional(),
});

export const updateDealSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional().nullable(),
  discountPct: z.number().int().min(1).max(100).optional().nullable(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional().nullable(),
  active: z.boolean().optional(),
});
