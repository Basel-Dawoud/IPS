import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Share } from "react-native";
import { createShare, stopShare } from "./api";
import type { ShareDurationMin } from "./types";

interface ActiveShare {
  token: string;
  url: string;
  expiresAt: string | null;
}

/**
 * Owns the "I am sharing my live location" state: creates the share link,
 * opens the native share sheet, and stops/expires it. `refreshKey` bumps on
 * every change so the publisher socket re-reads its active shares.
 */
export function useLocationShare(buildingId: string | null) {
  const [activeShare, setActiveShare] = useState<ActiveShare | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear the pill when a timed share runs out.
  useEffect(() => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    if (!activeShare?.expiresAt) return;
    const ms = new Date(activeShare.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      setActiveShare(null);
      return;
    }
    expiryTimerRef.current = setTimeout(() => setActiveShare(null), ms);
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [activeShare]);

  const start = useCallback(
    async (durationMin: ShareDurationMin) => {
      if (busy) return;
      setBusy(true);
      try {
        const share = await createShare(buildingId, durationMin);
        setActiveShare(share);
        setRefreshKey((k) => k + 1);
        // `message` (not `url`) so the link survives on Android share targets.
        await Share.share({ message: `Follow my live location on Navimind: ${share.url}` });
      } catch (err: any) {
        Alert.alert("Couldn't share location", err?.message ?? "Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [buildingId, busy],
  );

  const stop = useCallback(async () => {
    const share = activeShare;
    if (!share) return;
    setActiveShare(null);
    setRefreshKey((k) => k + 1);
    try {
      await stopShare(share.token);
    } catch (err) {
      console.warn("Failed to stop location share:", err);
    }
  }, [activeShare]);

  return { activeShare, refreshKey, busy, start, stop };
}
