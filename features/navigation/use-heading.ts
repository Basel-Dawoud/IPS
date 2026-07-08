/**
 * Compass heading hook for the Navigate map's user-direction cone.
 *
 * Source of truth is the OS magnetometer-fused compass via
 * `expo-location.watchHeadingAsync` (already tilt-compensated). The raw compass
 * is jittery when standing still and laggy on fast turns, so a small continuous
 * loop runs an adaptive circular EMA toward the latest reading:
 *   • when the phone is rotating (IMU gyroZ magnitude high) → higher gain, so
 *     the cone tracks the turn responsively;
 *   • when still → low gain, so jitter is smoothed away.
 * The IMU (DeviceMotion rotationRate) only gates the gain — we never integrate
 * gyro sign, so there's no fragile axis/handedness assumption to get wrong.
 *
 * Everything native is lazy-required in try/catch (Expo Go safe) — same pattern
 * as `features/ble/lazy-ble.ts`.
 *
 * Returns a real-world compass bearing (0 = north, 90 = east). The caller
 * subtracts the building's `northOffsetDeg` to get the map-frame heading.
 */
import { useEffect, useRef, useState } from "react";

// ── Lazy module loaders ──

let _location: any = null;
let _locationUnavailable = false;
function getLocation(): any {
  if (_locationUnavailable) return null;
  if (_location) return _location;
  try {
    _location = require("expo-location");
    return _location;
  } catch (e) {
    _locationUnavailable = true;
    console.warn("[Heading] expo-location unavailable", e);
    return null;
  }
}

let _sensors: any = null;
let _sensorsUnavailable = false;
function getSensors(): any {
  if (_sensorsUnavailable) return null;
  if (_sensors) return _sensors;
  try {
    _sensors = require("expo-sensors");
    return _sensors;
  } catch (e) {
    _sensorsUnavailable = true;
    console.warn("[Heading] expo-sensors unavailable", e);
    return null;
  }
}

// ── Angle helpers (degrees) ──

/** Shortest signed arc from a→b in (-180, 180]. */
function shortestArc(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

function normalize360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

// ── Config ──

const LOOP_MS = 60; // ~16 Hz smoothing loop
const UI_THROTTLE_MS = 90; // ~11 Hz state updates
// EMA gain floor (still) → ceiling (turning fast). Gain is picked from the
// live gyroZ magnitude so the cone is calm at rest and snappy in a turn.
const GAIN_STILL = 0.08;
const GAIN_TURN = 0.5;
const GYRO_STILL = 0.15; // rad/s — below this the phone is ~stationary
const GYRO_TURN = 1.5; // rad/s — at/above this, treat as a fast turn

/** Map expo-location heading `accuracy` to an approximate cone half-width (deg). */
function accuracyToDeg(accuracy: number | undefined): number | null {
  if (accuracy == null || accuracy < 0) return null;
  // iOS reports degrees directly (can exceed 3); Android reports a 0-3 enum.
  if (accuracy > 3) return accuracy;
  return [180, 90, 45, 22][Math.round(accuracy)] ?? 45;
}

export interface HeadingState {
  /** Smoothed real-world compass bearing in degrees (0 = N, 90 = E), or null. */
  headingDeg: number | null;
  /** Approximate heading accuracy half-width in degrees (larger = worse). */
  accuracyDeg: number | null;
  /** Whether a compass subscription is active. */
  available: boolean;
}

export function useHeading(opts: { enabled?: boolean } = {}): HeadingState {
  const { enabled = true } = opts;

  const [state, setState] = useState<HeadingState>({
    headingDeg: null,
    accuracyDeg: null,
    available: false,
  });

  // Live values written by the sensor listeners, read by the smoothing loop.
  const rawHeadingRef = useRef<number | null>(null);
  const rawAccuracyRef = useRef<number | null>(null);
  const gyroMagRef = useRef(0);
  const estRef = useRef<number | null>(null);
  const lastUiAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const subs: { remove: () => void }[] = [];
    let loopTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const Location = getLocation();
      if (Location?.watchHeadingAsync) {
        try {
          const sub = await Location.watchHeadingAsync((h: any) => {
            // Prefer true (north-referenced) heading; fall back to magnetic.
            const t = typeof h.trueHeading === "number" ? h.trueHeading : -1;
            const m = typeof h.magHeading === "number" ? h.magHeading : -1;
            const heading = t >= 0 ? t : m >= 0 ? m : null;
            if (heading == null) return;
            rawHeadingRef.current = normalize360(heading);
            rawAccuracyRef.current = accuracyToDeg(h.accuracy);
            if (estRef.current == null) estRef.current = rawHeadingRef.current;
          });
          if (cancelled) sub.remove();
          else subs.push(sub);
        } catch (e) {
          console.warn("[Heading] watchHeadingAsync failed", e);
        }
      }

      // IMU rotation-rate magnitude → adaptive smoothing gain only.
      const Sensors = getSensors();
      if (Sensors?.DeviceMotion?.isAvailableAsync) {
        try {
          const ok = await Sensors.DeviceMotion.isAvailableAsync();
          if (ok && !cancelled) {
            await Sensors.DeviceMotion.setUpdateInterval(LOOP_MS);
            const sub = Sensors.DeviceMotion.addListener((d: any) => {
              const gz = d.rotationRate?.alpha ?? 0;
              // Light low-pass so a single spike doesn't slam the gain.
              gyroMagRef.current =
                0.6 * gyroMagRef.current + 0.4 * Math.abs(gz);
            });
            subs.push(sub);
          }
        } catch (e) {
          console.warn("[Heading] DeviceMotion (gain gate) unavailable", e);
        }
      }

      if (cancelled) return;
      setState((p) => ({ ...p, available: rawHeadingRef.current != null }));

      // Continuous smoothing loop: blend the estimate toward the latest
      // compass reading with a gyro-gated gain, emit throttled state.
      loopTimer = setInterval(() => {
        const raw = rawHeadingRef.current;
        if (raw == null) return;
        if (estRef.current == null) estRef.current = raw;

        // Gyro-gated gain: interpolate GAIN_STILL→GAIN_TURN across the rate band.
        const g = gyroMagRef.current;
        const f = Math.max(
          0,
          Math.min(1, (g - GYRO_STILL) / (GYRO_TURN - GYRO_STILL)),
        );
        const gain = GAIN_STILL + f * (GAIN_TURN - GAIN_STILL);

        estRef.current = normalize360(
          estRef.current + gain * shortestArc(estRef.current, raw),
        );

        const now = Date.now();
        if (now - lastUiAtRef.current < UI_THROTTLE_MS) return;
        lastUiAtRef.current = now;
        setState({
          headingDeg: Math.round(estRef.current * 10) / 10,
          accuracyDeg: rawAccuracyRef.current,
          available: true,
        });
      }, LOOP_MS);
    })();

    return () => {
      cancelled = true;
      if (loopTimer) clearInterval(loopTimer);
      for (const s of subs) {
        try {
          s.remove();
        } catch {}
      }
    };
  }, [enabled]);

  return state;
}
