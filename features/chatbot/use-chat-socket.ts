import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { io, Socket } from "socket.io-client";
import { env } from "@/lib/env";
import { getAuthToken } from "@/features/auth/auth-storage";
import { apiClient } from "@/lib/api-client";

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
  action?: {
    type: "navigate";
    poiId: string;
    floorLevel: number;
  };
}

interface UseChatSocketProps {
  buildingId: string | null;
  floorLevel?: number;
}

export function useChatSocket({ buildingId, floorLevel }: UseChatSocketProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track last suggested POI ID client-side for the two-step navigate flow
  const lastSuggestedPoiIdRef = useRef<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Sync ref with latest sessionId to prevent socket connection useEffect from restarting
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const syncSessionMessages = useCallback(async (id: string) => {
    try {
      console.log(`[ChatSocket] Syncing messages for session ${id} on reconnect...`);
      const { data } = await apiClient.get<any[]>(`/client/chat/sessions/${id}/messages`);
      
      const mappedMessages: ChatMessage[] = data.map((msg) => ({
        id: msg.id,
        text: msg.text,
        sender: msg.sender.toLowerCase() as "user" | "assistant",
        timestamp: new Date(msg.createdAt),
        action: msg.action || undefined,
      }));
      setMessages(mappedMessages);
      
      const lastAssistantMsg = [...mappedMessages]
        .reverse()
        .find((m) => m.sender === "assistant");
        
      if (lastAssistantMsg?.action?.type === "navigate" || lastAssistantMsg?.action?.type === "suggest") {
        lastSuggestedPoiIdRef.current = lastAssistantMsg.action.poiId;
      } else {
        lastSuggestedPoiIdRef.current = null;
      }
    } catch (err) {
      console.error("[ChatSocket] Failed to sync session messages on reconnect:", err);
    }
  }, []);

  useEffect(() => {
    if (!buildingId) return;

    // Retrieve active JWT token for authentication
    const token = getAuthToken();

    // Derive socket base URL from API URL (strip trailing /api)
    const socketUrl = env.apiUrl.replace(/\/api$/, "");
    console.log(`[ChatSocket] Connecting to chatbot socket at: ${socketUrl}/chat with token presence: ${!!token}`);
    
    const socket = io(`${socketUrl}/chat`, {
      transports: ["websocket"],
      autoConnect: true,
      reconnectionAttempts: 5,
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[ChatSocket] Socket.IO chatbot connected successfully.");
      setIsConnected(true);
      setError(null);
      if (sessionIdRef.current) {
        syncSessionMessages(sessionIdRef.current);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[ChatSocket] Socket.IO chatbot disconnected:", reason);
      setIsConnected(false);
      setIsSending(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[ChatSocket] Socket.IO chatbot connection error:", err);
      setIsConnected(false);
      setIsSending(false);
      setError("Connection error. Reconnecting...");
    });

    socket.on("chat_reply", (data: { reply: string; lang: string; action?: any; sessionId?: string; clearPending?: boolean }) => {
      setIsSending(false);

      // Update our local session identifier if returned by the server
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      // If the reply contains a suggestion or product location, store the POI ID
      // (or action target) so we can pass it back if the user responds with agreement
      if (data.action?.type === "navigate" || data.action?.type === "suggest") {
        lastSuggestedPoiIdRef.current = data.action.poiId;
      } else if (data.clearPending) {
        // The server says the pending offer was declined/consumed — forget it
        // so a later bare "yes" can't accidentally revive a stale suggestion.
        lastSuggestedPoiIdRef.current = null;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          text: data.reply,
          sender: "assistant",
          timestamp: new Date(),
          action: data.action,
        },
      ]);
    });

    socket.on("chat_error", (data: { error: string }) => {
      setIsSending(false);
      setError(data.error);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          text: `Error: ${data.error}`,
          sender: "assistant",
          timestamp: new Date(),
        },
      ]);
    });

    // Track app state to trigger forced reconnection when returning from background/sleep
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        console.log("[ChatSocket] App returned to active foreground. Checking socket state...");
        if (socketRef.current && !socketRef.current.connected) {
          console.log("[ChatSocket] Socket disconnected, forcing connect...");
          socketRef.current.connect();
        }
      }
    };

    const appStateSubscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      console.log("[ChatSocket] Cleaning up socket connection...");
      appStateSubscription.remove();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [buildingId]);

  const sendMessage = useCallback((text: string) => {
    if (!socketRef.current || !isConnected || !buildingId) {
      // Don't drop the message silently — the user needs to know it wasn't
      // sent (this looked like "some chats are not saved").
      console.warn("[ChatSocket] Cannot send message: socket not connected or no buildingId");
      setError("Not connected — message not sent. Please try again.");
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText) return;

    // Append user message to state
    setMessages((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        text: trimmedText,
        sender: "user",
        timestamp: new Date(),
      },
    ]);

    setIsSending(true);
    setError(null);

    // Always forward the pending suggestion (if any). Deciding whether the
    // message is an agreement ("yes"/"Yepppp"/"ايوه") is the chatbot brain's
    // job — it detects confirmations robustly and ignores a stale pending id
    // when the message is a new request, so sending it every turn is safe.
    // A client-side regex here previously dropped valid confirmations like
    // "Yepppp", which made the brain echo instead of navigate.
    socketRef.current.emit("chat_message", {
      buildingId,
      message: trimmedText,
      floorLevel,
      sessionId: sessionId || undefined,
      lastSuggestedPoiId: lastSuggestedPoiIdRef.current || undefined,
    });
  }, [isConnected, buildingId, floorLevel, sessionId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    lastSuggestedPoiIdRef.current = null;
  }, []);

  const loadSessionMessages = useCallback((pastMessages: ChatMessage[], activeId: string) => {
    setMessages(pastMessages);
    setSessionId(activeId);
    
    // Attempt to recover the last suggested POI ID from the last assistant message
    const lastAssistantMsg = [...pastMessages]
      .reverse()
      .find((m) => m.sender === "assistant");
      
    if (lastAssistantMsg?.action?.type === "navigate" || lastAssistantMsg?.action?.type === "suggest") {
      lastSuggestedPoiIdRef.current = lastAssistantMsg.action.poiId;
    } else {
      lastSuggestedPoiIdRef.current = null;
    }
  }, []);

  return {
    messages,
    sessionId,
    isConnected,
    isSending,
    error,
    sendMessage,
    clearMessages,
    loadSessionMessages,
    lastSuggestedPoiId: lastSuggestedPoiIdRef.current,
    setLastSuggestedPoiId: (id: string | null) => {
      lastSuggestedPoiIdRef.current = id;
    }
  };
}
