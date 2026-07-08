import { io, Socket } from "socket.io-client";
import { env } from "@/lib/env";
import { getAuthToken } from "@/features/auth/auth-storage";

/**
 * Connect to the backend's /location Socket.IO namespace (same connect/auth
 * pattern as the chatbot socket). Caller owns the socket and must disconnect.
 */
export function connectLocationSocket(): Socket {
  const socketUrl = env.apiUrl.replace(/\/api$/, "");
  return io(`${socketUrl}/location`, {
    transports: ["websocket"],
    autoConnect: true,
    reconnectionAttempts: 10,
    auth: { token: getAuthToken() },
  });
}
