import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { connectLocationSocket } from "./location-socket";

// Positioning tick is ~1 s; don't spam the relay faster than this.
const PUBLISH_MIN_INTERVAL_MS = 1_500;

interface UseLocationPublisherProps {
  /** Publish only while true (active share OR friends-presence sharing). */
  enabled: boolean;
  buildingId: string | null;
  /** Live position in meter coords (x along-corridor, y centerline). */
  x: number | null;
  y: number | null;
  floorLevel: number | null;
  /** Bump after creating/stopping a share so the server refreshes its cache. */
  refreshKey?: number;
}

/**
 * Streams the phone's live indoor position to the /location namespace.
 * The server relays it to active share tokens and to friends' watchers.
 */
export function useLocationPublisher({
  enabled,
  buildingId,
  x,
  y,
  floorLevel,
  refreshKey = 0,
}: UseLocationPublisherProps) {
  const socketRef = useRef<Socket | null>(null);
  const lastEmitMsRef = useRef(0);

  // Connect / disconnect with `enabled`.
  useEffect(() => {
    if (!enabled) return;
    const socket = connectLocationSocket();
    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  // Tell the server to re-read active shares after create/stop.
  useEffect(() => {
    if (refreshKey > 0) socketRef.current?.emit("refresh_shares");
  }, [refreshKey]);

  // Throttled publish on each position update.
  useEffect(() => {
    const socket = socketRef.current;
    if (!enabled || !socket || !buildingId) return;
    if (x == null || y == null || floorLevel == null) return;
    const now = Date.now();
    if (now - lastEmitMsRef.current < PUBLISH_MIN_INTERVAL_MS) return;
    lastEmitMsRef.current = now;
    socket.emit("publish", { x, y, floorLevel, buildingId });
  }, [enabled, buildingId, x, y, floorLevel]);
}
