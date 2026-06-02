import { Request, Response } from "express";
import { appleSignInSchema, googleSignInSchema } from "./auth.schema";
import * as authService from "./auth.service";
import { AuthError } from "./auth.service";
import {
  sendError,
  sendNotFound,
  sendServerError,
  sendSuccess,
  sendValidationError,
} from "../../utils/response";

function handleAuthError(res: Response, err: unknown) {
  if (err instanceof AuthError) {
    if (err.code === "auth-not-configured") {
      return sendError(res, err.message, 503, { code: err.code });
    }
    return sendError(res, err.message, 401, { code: err.code });
  }
  console.error("[auth] unexpected error:", err);
  return sendServerError(res, "Authentication failed");
}

export const signInGoogle = async (req: Request, res: Response) => {
  try {
    const { idToken } = googleSignInSchema.parse(req.body);
    const result = await authService.signInWithGoogle(idToken);
    return sendSuccess(res, result);
  } catch (err: any) {
    if (err?.name === "ZodError") return sendValidationError(res, err.errors);
    return handleAuthError(res, err);
  }
};

export const signInApple = async (req: Request, res: Response) => {
  try {
    const input = appleSignInSchema.parse(req.body);
    const result = await authService.signInWithApple(input);
    return sendSuccess(res, result);
  } catch (err: any) {
    if (err?.name === "ZodError") return sendValidationError(res, err.errors);
    return handleAuthError(res, err);
  }
};

export const me = async (req: Request, res: Response) => {
  if (!req.user) return sendError(res, "Unauthenticated", 401);
  const user = await authService.getUserById(req.user.id);
  if (!user) return sendNotFound(res, "User");
  return sendSuccess(res, user);
};
