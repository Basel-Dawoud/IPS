import { NextFunction, Request, Response } from "express";
import { verifyAppToken, AuthError } from "../modules/auth/auth.service";
import { sendError } from "../utils/response";

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return next();

  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return next();

  try {
    const payload = await verifyAppToken(match[1]);
    req.user = { id: payload.sub, email: payload.email ?? undefined };
  } catch (err) {
    if (!(err instanceof AuthError) || err.code !== "auth-not-configured") {
    }
  }
  return next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return sendError(res, "Authentication required", 401);
  return next();
}
