import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
  // null/omitted => a top-level category; a cuid => a sub-category of that parent.
  parentId: z.string().cuid().nullable().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
  parentId: z.string().cuid().nullable().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
