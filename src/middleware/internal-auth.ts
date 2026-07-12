import { NextFunction, Request, Response } from "express";
import { getInternalAccessForUser } from "../modules/internal-auth/internal-role.service";
import { sendError } from "../utils/response";

/**
 * Resolves req.internalUser from the already-authenticated client user
 * (req.user, set by optionalAuth). There is no separate internal login —
 * admin-ness is just User.internalRoleId being non-null. If the caller
 * isn't logged in at all, or is logged in but internalRoleId is null,
 * req.internalUser is simply left undefined — that IS the "not an admin"
 * state, not an error. Must run after optionalAuth (see app.ts order).
 */
export async function optionalInternalAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next();

  const access = await getInternalAccessForUser(req.user.id);
  if (access) {
    req.internalUser = {
      id: req.user.id,
      email: access.email,
      roleId: access.roleId,
      roleKey: access.roleKey,
      permissions: access.permissions,
    };
  }
  return next();
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.internalUser) return sendError(res, "Internal authentication required", 401);
  return next();
}

export function requirePermission(permissionKey: string | string[]) {
  const needed = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.internalUser) return sendError(res, "Internal authentication required", 401);
    const has = needed.every((k) => req.internalUser!.permissions.includes(k));
    if (!has) return sendError(res, "Insufficient permissions", 403);
    return next();
  };
}

export function requireRole(roleKey: string | string[]) {
  const allowed = Array.isArray(roleKey) ? roleKey : [roleKey];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.internalUser) return sendError(res, "Internal authentication required", 401);
    if (!allowed.includes(req.internalUser.roleKey)) return sendError(res, "Insufficient role", 403);
    return next();
  };
}
