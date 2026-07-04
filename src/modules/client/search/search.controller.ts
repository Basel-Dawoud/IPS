import { Request, Response } from "express";
import * as searchService from "./search.service";
import { sendSuccess, sendServerError } from "../../../utils/response";

export const getSearch = async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const results = await searchService.search(q);
    return sendSuccess(res, results);
  } catch (error) {
    console.error("[client/search] failed:", error);
    return sendServerError(res, "Failed to search");
  }
};
