import { Request, Response } from "express";
import {
  createInternalRoleSchema,
  grantInternalRoleSchema,
  updateInternalRoleSchema,
} from "./internal-users.schema";
import * as internalUsersService from "./internal-users.service";
import {
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendServerError,
  sendSuccess,
  sendValidationError,
  sendBadRequest,
} from "../../../utils/response";

export const listUsers = async (req: Request, res: Response) => {
  try {
    const users = await internalUsersService.listInternalUsers();
    return sendSuccess(res, users);
  } catch (error) {
    return sendServerError(res, "Failed to fetch internal users");
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    const user = await internalUsersService.getInternalUser(req.params.id);
    if (!user) return sendNotFound(res, "Internal user");
    return sendSuccess(res, user);
  } catch (error) {
    return sendServerError(res, "Failed to fetch internal user");
  }
};

export const grantRole = async (req: Request, res: Response) => {
  try {
    const data = grantInternalRoleSchema.parse(req.body);
    const user = await internalUsersService.grantInternalRole(data);
    return sendCreated(res, user, "Internal role granted");
  } catch (error: any) {
    if (error.name === "ZodError") return sendValidationError(res, error.errors);
    if (error.message?.includes("Password is required")) return sendBadRequest(res, error.message);
    console.error("[internal-users] grant failed:", error);
    return sendServerError(res, "Failed to grant internal role");
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const { roleId } = updateInternalRoleSchema.parse(req.body);
    const user = await internalUsersService.updateInternalUserRole(req.params.id, roleId);
    return sendSuccess(res, user, 200, "Role updated");
  } catch (error: any) {
    if (error.name === "ZodError") return sendValidationError(res, error.errors);
    if (error.code === "P2025") return sendNotFound(res, "Internal user");
    console.error("[internal-users] update role failed:", error);
    return sendServerError(res, "Failed to update role");
  }
};

export const revokeRole = async (req: Request, res: Response) => {
  try {
    await internalUsersService.revokeInternalRole(req.params.id);
    return sendNoContent(res);
  } catch (error: any) {
    if (error.code === "P2025") return sendNotFound(res, "Internal user");
    return sendServerError(res, "Failed to revoke internal role");
  }
};

export const listRoles = async (req: Request, res: Response) => {
  try {
    const roles = await internalUsersService.listInternalRoles();
    return sendSuccess(res, roles);
  } catch (error) {
    return sendServerError(res, "Failed to fetch internal roles");
  }
};

export const createRole = async (req: Request, res: Response) => {
  try {
    const data = createInternalRoleSchema.parse(req.body);
    const role = await internalUsersService.createInternalRole(data);
    return sendCreated(res, role, "Role created");
  } catch (error: any) {
    if (error.name === "ZodError") return sendValidationError(res, error.errors);
    if (error.message?.includes("already exists") || error.message?.includes("invalid")) {
      return sendBadRequest(res, error.message);
    }
    console.error("[internal-users] create role failed:", error);
    return sendServerError(res, "Failed to create role");
  }
};

export const listPermissions = async (req: Request, res: Response) => {
  try {
    const permissions = await internalUsersService.listInternalPermissions();
    return sendSuccess(res, permissions);
  } catch (error) {
    return sendServerError(res, "Failed to fetch permissions");
  }
};
