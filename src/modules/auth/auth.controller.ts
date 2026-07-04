import { Request, Response } from "express";
import { appleSignInSchema, googleSignInSchema, registerSchema, loginSchema, changePasswordSchema } from "./auth.schema";
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

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const result = await authService.signUpWithEmail(email, password, name);
    return sendSuccess(res, result);
  } catch (err: any) {
    if (err?.name === "ZodError") return sendValidationError(res, err.errors);
    return handleAuthError(res, err);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await authService.loginWithEmail(email, password);
    return sendSuccess(res, result);
  } catch (err: any) {
    if (err?.name === "ZodError") return sendValidationError(res, err.errors);
    return handleAuthError(res, err);
  }
};

export const changePassword = async (req: Request, res: Response) => {
  if (!req.user) return sendError(res, "Unauthenticated", 401);
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    return sendSuccess(res, { success: true });
  } catch (err: any) {
    if (err?.name === "ZodError") return sendValidationError(res, err.errors);
    return handleAuthError(res, err);
  }
};
