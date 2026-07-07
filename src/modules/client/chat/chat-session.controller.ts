import { Request, Response } from "express";
import prisma from "../../../lib/prisma";
import {
  sendSuccess,
  sendNotFound,
  sendServerError,
  sendBadRequest,
} from "../../../utils/response";

export const getSessions = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendBadRequest(res, "User not authenticated");
    }

    const { buildingId } = req.query;
    if (!buildingId || typeof buildingId !== "string") {
      return sendBadRequest(res, "buildingId query parameter is required");
    }

    const sessions = await prisma.chatSession.findMany({
      where: {
        userId,
        buildingId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return sendSuccess(res, sessions);
  } catch (error) {
    console.error("[chat-session/getSessions] failed:", error);
    return sendServerError(res, "Failed to fetch chat sessions");
  }
};

export const getSessionMessages = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendBadRequest(res, "User not authenticated");
    }

    const { id: sessionId } = req.params;

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return sendNotFound(res, "Chat session");
    }

    if (session.userId !== userId) {
      return sendNotFound(res, "Chat session");
    }

    const messages = await prisma.chatPersistedMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    return sendSuccess(res, messages);
  } catch (error) {
    console.error("[chat-session/getSessionMessages] failed:", error);
    return sendServerError(res, "Failed to fetch session messages");
  }
};

export const deleteSession = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendBadRequest(res, "User not authenticated");
    }

    const { id: sessionId } = req.params;

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return sendNotFound(res, "Chat session");
    }

    if (session.userId !== userId) {
      return sendNotFound(res, "Chat session");
    }

    await prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return sendSuccess(res, { deleted: true });
  } catch (error) {
    console.error("[chat-session/deleteSession] failed:", error);
    return sendServerError(res, "Failed to delete chat session");
  }
};
