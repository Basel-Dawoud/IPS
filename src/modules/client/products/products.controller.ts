import { Request, Response } from "express";
import * as productService from "./products.service";
import { sendSuccess, sendBadRequest, sendServerError } from "../../../utils/response";

// GET /api/client/products?buildingId=... — read-only product listing for a
// building. Used by the chatbot service to build product recommendations.
export const getProducts = async (req: Request, res: Response) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;
    if (!buildingId) {
      return sendBadRequest(res, "buildingId query parameter is required");
    }
    const products = await productService.getProductsForBuilding(buildingId);
    return sendSuccess(res, products);
  } catch (error) {
    return sendServerError(res, "Failed to fetch products");
  }
};
