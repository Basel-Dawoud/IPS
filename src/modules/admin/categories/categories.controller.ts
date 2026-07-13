import { Request, Response } from "express";
import * as service from "./categories.service";
import { createCategorySchema, updateCategorySchema } from "./categories.schema";
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendServerError,
} from "../../../utils/response";

export const list = async (_req: Request, res: Response) => {
  try {
    return sendSuccess(res, await service.getCategoryTree());
  } catch (error) {
    console.error("[categories.controller] list error:", error);
    return sendServerError(res, "Failed to fetch categories");
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendBadRequest(res, parsed.error.issues[0]?.message ?? "Invalid category");
    }
    return sendSuccess(res, await service.createCategory(parsed.data));
  } catch (error: any) {
    if (error?.code === "P2002") return sendBadRequest(res, "A category with that name already exists");
    console.error("[categories.controller] create error:", error);
    return sendServerError(res, "Failed to create category");
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const parsed = updateCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendBadRequest(res, parsed.error.issues[0]?.message ?? "Invalid category");
    }
    return sendSuccess(res, await service.updateCategory(req.params.id, parsed.data));
  } catch (error: any) {
    if (error?.code === "P2002") return sendBadRequest(res, "A category with that name already exists");
    if (error?.code === "P2025") return sendNotFound(res, "Category");
    console.error("[categories.controller] update error:", error);
    return sendServerError(res, "Failed to update category");
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const result = await service.deleteCategory(req.params.id);
    if (result.blocked) {
      if (result.reason === "not_found") return sendNotFound(res, "Category");
      return sendBadRequest(res, `Cannot delete: ${result.reason}`);
    }
    return sendSuccess(res, { success: true });
  } catch (error) {
    console.error("[categories.controller] remove error:", error);
    return sendServerError(res, "Failed to delete category");
  }
};
