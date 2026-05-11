import { Response } from "express";

/**
 * Standard API Response Format
 *
 * Success: { success: true, data: T, message?: string }
 * Error: { success: false, error: string, details?: any }
 */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  pagination?: PaginationInfo;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: any;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string,
  pagination?: PaginationInfo
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  if (pagination) {
    response.pagination = pagination;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send created response (201)
 */
export function sendCreated<T>(res: Response, data: T, message?: string): Response {
  return sendSuccess(res, data, 201, message);
}

/**
 * Send no content response (204)
 */
export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  error: string,
  statusCode: number = 500,
  details?: any
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error,
  };

  if (details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
}

/**
 * Send bad request (400)
 */
export function sendBadRequest(res: Response, error: string, details?: any): Response {
  return sendError(res, error, 400, details);
}

/**
 * Send not found (404)
 */
export function sendNotFound(res: Response, resource: string = "Resource"): Response {
  return sendError(res, `${resource} not found`, 404);
}

/**
 * Send validation error (400) - for Zod errors
 */
export function sendValidationError(res: Response, errors: any): Response {
  return sendError(res, "Validation failed", 400, errors);
}

/**
 * Send internal server error (500)
 */
export function sendServerError(
  res: Response,
  message: string = "Internal server error"
): Response {
  return sendError(res, message, 500);
}
