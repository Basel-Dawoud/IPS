import { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  sendError,
  sendServerError,
} from "../../../utils/response";
import { createShareSchema, acceptInviteSchema } from "./location-sharing.schema";
import * as service from "./location-sharing.service";
import { LocationSharingError } from "./location-sharing.service";

function handleKnownError(res: Response, err: unknown): Response | null {
  if (err instanceof LocationSharingError) {
    const status =
      err.code === "not-found" ? 404
      : err.code === "gone" ? 410
      : err.code === "forbidden" ? 403
      : 409;
    return sendError(res, err.message, status);
  }
  return null;
}

// ── Shares ──────────────────────────────────────────────────────────────

export const createShare = async (req: Request, res: Response) => {
  try {
    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendBadRequest(res, parsed.error.issues[0]?.message ?? "Invalid share options");
    }
    const result = await service.createShare(
      req.user!.id,
      parsed.data.buildingId,
      parsed.data.durationMin,
    );
    return sendCreated(res, result);
  } catch (error: any) {
    console.error("[location-sharing] createShare error:", error);
    return sendServerError(res, "Failed to create location share");
  }
};

export const getShare = async (req: Request, res: Response) => {
  try {
    const view = await service.getShareView(req.params.token);
    return sendSuccess(res, view);
  } catch (error: any) {
    const handled = handleKnownError(res, error);
    if (handled) return handled;
    console.error("[location-sharing] getShare error:", error);
    return sendServerError(res, "Failed to resolve location share");
  }
};

export const stopShare = async (req: Request, res: Response) => {
  try {
    await service.stopShare(req.user!.id, req.params.token);
    // Let watchers know immediately.
    (req as any).io?.of("/location").to(`share_${req.params.token}`).emit("share_ended", {
      token: req.params.token,
    });
    return sendSuccess(res, { stopped: true });
  } catch (error: any) {
    const handled = handleKnownError(res, error);
    if (handled) return handled;
    console.error("[location-sharing] stopShare error:", error);
    return sendServerError(res, "Failed to stop location share");
  }
};

// ── Friends ─────────────────────────────────────────────────────────────

export const createInvite = async (req: Request, res: Response) => {
  try {
    const result = await service.createFriendInvite(req.user!.id);
    return sendCreated(res, result);
  } catch (error: any) {
    console.error("[location-sharing] createInvite error:", error);
    return sendServerError(res, "Failed to create friend invite");
  }
};

export const getInvite = async (req: Request, res: Response) => {
  try {
    const view = await service.getInviteView(req.params.token);
    return sendSuccess(res, view);
  } catch (error: any) {
    const handled = handleKnownError(res, error);
    if (handled) return handled;
    console.error("[location-sharing] getInvite error:", error);
    return sendServerError(res, "Failed to resolve friend invite");
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  try {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendBadRequest(res, "tokenOrCode is required");
    }
    const result = await service.acceptFriendInvite(req.user!.id, parsed.data.tokenOrCode);
    return sendSuccess(res, result);
  } catch (error: any) {
    const handled = handleKnownError(res, error);
    if (handled) return handled;
    console.error("[location-sharing] acceptInvite error:", error);
    return sendServerError(res, "Failed to accept friend invite");
  }
};

export const listFriends = async (req: Request, res: Response) => {
  try {
    const friends = await service.listFriends(req.user!.id);
    return sendSuccess(res, friends);
  } catch (error: any) {
    console.error("[location-sharing] listFriends error:", error);
    return sendServerError(res, "Failed to list friends");
  }
};

export const removeFriend = async (req: Request, res: Response) => {
  try {
    await service.removeFriend(req.user!.id, req.params.userId);
    return sendSuccess(res, { removed: true });
  } catch (error: any) {
    const handled = handleKnownError(res, error);
    if (handled) return handled;
    console.error("[location-sharing] removeFriend error:", error);
    return sendServerError(res, "Failed to remove friend");
  }
};
