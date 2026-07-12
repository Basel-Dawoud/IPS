import { useEffect, useRef } from "react";
import { env } from "@/lib/env";
import { publishPosition, startTelemetry, stopTelemetry } from "./mqtt-telemetry";

// Heartbeat cadence — publish this often while positioned, moving or not.
// Matches the simulator's steady stream and keeps a standing user's dot alive
// (live map prunes after 5 s) and their cell counted in the density/room
// heatmaps. Mirrors use-location-publisher's ~1.5 s throttle.
const PUBLISH_INTERVAL_MS = 1_500;
// Moving less than this since the last publish counts as standing still.
const STATIONARY_EPSILON_M = 0.4;

interface UseMqttTelemetryProps {
  /** Publish only while true (positioned inside a building). */
  enabled: boolean;
  buildingId: string | null;
  /** Live position in meter coords. */
  x: number | null;
  y: number | null;
  floorLevel: number | null;
}

/**
 * Streams ANONYMIZED positions to the MQTT broker for the IPS heatmap.
 * Runs beside useLocationPublisher (which handles identified sharing over
 * socket.io) — different transport and privacy model.
 *
 * Publishing is driven by a HEARTBEAT interval, not by position changes:
 * a standing user's (x, y) stops updating, but we must keep emitting so the
 * live dot doesn't go stale and the density/room heatmaps keep counting them.
 * The latest inputs live in a ref the interval reads. Broker downtime is
 * invisible: every call is a fail-safe no-op.
 */
export function useMqttTelemetry({
  enabled,
  buildingId,
  x,
  y,
  floorLevel,
}: UseMqttTelemetryProps) {
  // Latest inputs, read by the heartbeat without restarting it.
  const latestRef = useRef({ buildingId, x, y, floorLevel });
  latestRef.current = { buildingId, x, y, floorLevel };

  const lastSentRef = useRef<{ x: number; y: number } | null>(null);

  // Connect / disconnect with `enabled`. New anonymous device id per session.
  useEffect(() => {
    if (!enabled) return;
    try {
      startTelemetry(env.mqttUrl);
    } catch {
      // startTelemetry is already fail-safe; belt and suspenders.
    }
    return () => {
      stopTelemetry();
      lastSentRef.current = null;
    };
  }, [enabled]);

  // Heartbeat: publish the current position every interval while positioned.
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const { buildingId: bId, x: cx, y: cy, floorLevel: fl } = latestRef.current;
      if (!bId || cx == null || cy == null || fl == null) return;

      const prev = lastSentRef.current;
      const moved =
        !prev || Math.hypot(cx - prev.x, cy - prev.y) > STATIONARY_EPSILON_M;
      lastSentRef.current = { x: cx, y: cy };

      publishPosition({
        buildingId: bId,
        floor: fl,
        x: cx,
        y: cy,
        motion: moved ? "walking" : "stationary",
      });
    };

    tick(); // emit immediately so the dot appears without waiting a full tick
    const id = setInterval(tick, PUBLISH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
