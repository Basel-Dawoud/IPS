import { useEffect, useState } from "react";
import { connectLocationSocket } from "./location-socket";
import type { LivePosition } from "./types";

interface UseFriendPositionProps {
  /** One-off share link token… */
  shareToken?: string | null;
  /** …or a friend's user id (requires auth + friendship). */
  friendUserId?: string | null;
}

/**
 * Watches another user's live position over the /location namespace.
 * Exactly one of shareToken / friendUserId should be set.
 */
export function useFriendPosition({ shareToken, friendUserId }: UseFriendPositionProps) {
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!shareToken && !friendUserId) return;
    setEnded(false);
    setError(null);

    const socket = connectLocationSocket();

    const watch = () => {
      if (shareToken) socket.emit("watch_share", { token: shareToken });
      else if (friendUserId) socket.emit("watch_friend", { friendUserId });
    };

    socket.on("connect", () => {
      setConnected(true);
      watch(); // also re-joins the room after a reconnect
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("position", (pos: LivePosition) => setPosition(pos));
    socket.on("share_ended", () => setEnded(true));
    socket.on("location_error", (payload: { error?: string }) => {
      setError(payload?.error ?? "Location unavailable");
    });

    return () => {
      socket.disconnect();
    };
  }, [shareToken, friendUserId]);

  return { position, ended, error, connected };
}
