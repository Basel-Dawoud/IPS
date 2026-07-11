import { useCallback, useRef, useState } from "react";
import type { CrowdAlert, LivePosition } from "../types";
import { useLiveSocket } from "./useLiveSocket";

/** How long after the last update a device stays on the map (ported from IPS). */
export const STALE_TIMEOUT_MS = 5000;
/** Position messages arrive ~2/s; animate each hop over 1s (ported from IPS). */
export const LERP_DURATION_MS = 1000;
const TRAIL_MAX_POINTS = 16;

export interface DeviceEntry {
  deviceId: string;
  floor: number;
  prev: { x: number; y: number };
  target: { x: number; y: number };
  animStart: number;
  trail: { x: number; y: number }[];
  motion: "walking" | "stationary";
  accuracy: number;
  roomId: string | null;
  lastSeen: number;
}

/**
 * Live device state for one building, fed by the /ws/live socket.
 *
 * Positions live in a ref (Map keyed by device id) mutated on every message —
 * NOT React state — so 2 msgs/s × N devices never re-renders the page. The
 * LiveOverlay reads the map inside its own rAF loop. Alerts are low-frequency
 * and DO use state so panels/layers re-render on warning/clear.
 */
export function useLiveDevices(buildingId: string) {
  const devicesRef = useRef<Map<string, DeviceEntry>>(new Map());
  const [alerts, setAlerts] = useState<Record<string, CrowdAlert>>({});

  const upsert = useCallback((p: LivePosition) => {
    const now = performance.now();
    const existing = devicesRef.current.get(p.device_id);
    if (existing) {
      const t = Math.min(1, (now - existing.animStart) / LERP_DURATION_MS);
      const curX = existing.prev.x + (existing.target.x - existing.prev.x) * t;
      const curY = existing.prev.y + (existing.target.y - existing.prev.y) * t;
      // Floor change: jump, don't glide across the new floor.
      const jumped = existing.floor !== p.floor;
      existing.prev = jumped ? { x: p.x, y: p.y } : { x: curX, y: curY };
      existing.target = { x: p.x, y: p.y };
      existing.animStart = now;
      existing.floor = p.floor;
      existing.motion = p.motion ?? "walking";
      existing.accuracy = p.accuracy ?? 0;
      existing.roomId = p.room_id ?? null;
      existing.lastSeen = now;
      existing.trail.push({ x: p.x, y: p.y });
      if (jumped) existing.trail = [{ x: p.x, y: p.y }];
      if (existing.trail.length > TRAIL_MAX_POINTS) existing.trail.shift();
    } else {
      devicesRef.current.set(p.device_id, {
        deviceId: p.device_id,
        floor: p.floor,
        prev: { x: p.x, y: p.y },
        target: { x: p.x, y: p.y },
        animStart: now,
        trail: [{ x: p.x, y: p.y }],
        motion: p.motion ?? "walking",
        accuracy: p.accuracy ?? 0,
        roomId: p.room_id ?? null,
        lastSeen: now,
      });
    }
  }, []);

  const { connected, msgsPerSec } = useLiveSocket(buildingId, {
    onSnapshot: (items, activeAlerts) => {
      devicesRef.current.clear();
      items.forEach(upsert);
      setAlerts(Object.fromEntries(activeAlerts.map((a) => [a.room_id, a])));
    },
    onPosition: upsert,
    onAlert: (alert, level) => {
      setAlerts((prev) => {
        const next = { ...prev };
        if (level === "warning") next[alert.room_id] = alert;
        else delete next[alert.room_id];
        return next;
      });
    },
  });

  return { devicesRef, alerts, connected, msgsPerSec };
}
