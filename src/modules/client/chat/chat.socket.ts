import { Server, Socket } from "socket.io";
import { chatMessageSchema } from "./chat.schema";
import { processMessage } from "./chat.service";
import { verifyAppToken } from "../../auth/auth.service";
import prisma from "../../../lib/prisma";

/**
 * Initializes Socket.IO events for the client chatbot.
 */
export function initChatSocket(io: Server) {
  const chatNamespace = io.of("/chat");

  // Authentication Middleware for Socket.IO chatbot namespace
  chatNamespace.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        const payload = await verifyAppToken(token);
        socket.data.user = {
          id: payload.sub,
          email: payload.email,
        };
        console.log(`[Socket.IO] Authenticated user ${payload.sub} for socket ${socket.id}`);
      } else {
        console.log(`[Socket.IO] Anonymous guest connected on socket ${socket.id}`);
      }
      next();
    } catch (err: any) {
      console.warn(`[Socket.IO] Authentication failed on socket ${socket.id}:`, err.message);
      // We allow the connection to proceed even if auth fails, but treat them as anonymous guests
      next();
    }
  });

  chatNamespace.on("connection", (socket: Socket) => {
    console.log(`[Socket.IO] Client connected to chatbot: ${socket.id}`);

    socket.on("chat_message", async (payload: any) => {
      try {
        // Validate request structure using Zod
        const validation = chatMessageSchema.safeParse(payload);
        if (!validation.success) {
          console.warn(`[Socket.IO] Invalid chat payload from ${socket.id}:`, validation.error.format());
          socket.emit("chat_error", {
            error: "Invalid request format",
            details: validation.error.format(),
          });
          return;
        }

        const input = validation.data;
        const user = socket.data.user;

        let activeSessionId = input.sessionId;

        // If user is authenticated, we persist the chat conversation
        if (user) {
          if (activeSessionId) {
            // Validate that the session exists and belongs to this user
            const session = await prisma.chatSession.findUnique({
              where: { id: activeSessionId },
            });
            if (!session || session.userId !== user.id) {
              console.warn(`[Socket.IO] User ${user.id} tried to post to invalid/unowned session ${activeSessionId}`);
              socket.emit("chat_error", {
                error: "Chat session not found or access denied",
              });
              return;
            }
          } else {
            // Create a new session
            const sessionTitle = input.message.length > 35 
              ? `${input.message.substring(0, 32)}...` 
              : input.message;

            const newSession = await prisma.chatSession.create({
              data: {
                userId: user.id,
                buildingId: input.buildingId,
                title: sessionTitle,
              },
            });
            activeSessionId = newSession.id;
            console.log(`[Socket.IO] Created new chat session ${activeSessionId} for user ${user.id}`);
          }

          // Persist user's message
          await prisma.chatPersistedMessage.create({
            data: {
              sessionId: activeSessionId,
              sender: "USER",
              text: input.message,
            },
          });
        }

        // Process message via orchestration service
        const reply = await processMessage(input, user?.id);

        // If navigation was triggered and user is logged in, log the start of a visit
        if (user && reply.action?.type === "navigate") {
          try {
            const navPoiId = reply.action.poiId;
            const poi = await prisma.poi.findUnique({ where: { id: navPoiId } });
            if (poi) {
              await prisma.poiVisit.create({
                data: {
                  userId: user.id,
                  poiId: navPoiId,
                  buildingId: input.buildingId,
                  confirmed: false,
                },
              });
              await prisma.poi.update({
                where: { id: navPoiId },
                data: { visitCount: { increment: 1 } },
              });
            }
          } catch (err) {
            console.error("[Socket.IO] Error recording navigation visit:", err);
          }
        }

        // If user is authenticated, persist assistant's response
        if (user && activeSessionId) {
          await prisma.chatPersistedMessage.create({
            data: {
              sessionId: activeSessionId,
              sender: "ASSISTANT",
              text: reply.reply,
              action: reply.action ? JSON.parse(JSON.stringify(reply.action)) : undefined,
            },
          });

          // Update session timestamp
          await prisma.chatSession.update({
            where: { id: activeSessionId },
            data: { updatedAt: new Date() },
          });
        }

        // Emit response back to the sender, including the active sessionId
        socket.emit("chat_reply", {
          ...reply,
          sessionId: activeSessionId,
        });

      } catch (error: any) {
        console.error(`[Socket.IO] Error processing chatbot message from ${socket.id}:`, error);
        socket.emit("chat_error", {
          error: "Internal server error during message processing",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected from chatbot: ${socket.id}`);
    });
  });
}
