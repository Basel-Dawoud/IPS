/**
 * Motion + environmental sensors hook for fingerprinting.
 *
 * Subscribes to (when available on the device):
 *   • DeviceMotion @ 20 Hz — fused attitude (pitch/roll/yaw),
 *                            gravity-removed acceleration, rotation rate (gyro)
 *   • Accelerometer @ 20 Hz — raw acceleration incl. gravity (in g units)
 *   • Magnetometer @ 20 Hz — raw geomagnetic field (µT)
 *   • Barometer @ 5 Hz — atmospheric pressure (hPa) + relative altitude (iOS)
 *   • Pedometer (debug-only) — hardware step count since `start()`
 *
 * Two consumption paths:
 *   1. `latest()` — synchronous accessor returning the most recent fused
 *      SensorSnapshot. Designed to be called once per BLE advertisement by
 *      the scanner; no React re-render.
 *   2. `live` state — throttled @ ~10 Hz, drives the on-screen debug panel.
 *
 * All sensor APIs are loaded with the same lazy-require + try/catch pattern
 * as react-native-ble-plx so the app still runs under Expo Go (where some
 * native modules are absent). Each sensor calls `isAvailableAsync()` before
 * subscribing — Android devices without a barometer just leave those fields
 * undefined instead of crashing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { nowMonoMs } from "@/lib/mono-clock";

// ── Public types ──

export interface SensorSnapshot {
  // Accelerometer (raw, includes gravity) — g
  accelX?: number;
  accelY?: number;
  accelZ?: number;

  // DeviceMotion gravity-removed acceleration — m/s²
  userAccelX?: number;
  userAccelY?: number;
  userAccelZ?: number;
  /** Magnitude of (userAccelX, userAccelY, userAccelZ) — m/s². Debug-only;
   *  derived live from the three components inside the DeviceMotion listener. */
  userAccelMag?: number;

  // DeviceMotion attitude — rad
  pitch?: number;
  roll?: number;
  yaw?: number;

  // DeviceMotion rotation rate (== gyroscope) — rad/s
  gyroX?: number;
  gyroY?: number;
  gyroZ?: number;

  // Magnetometer (raw, uncalibrated) — µT
  magX?: number;
  magY?: number;
  magZ?: number;

  // Barometer
  pressure?: number; // hPa
  relativeAltitude?: number; // m, iOS only

  // Debug / monitoring (not stored per-reading)
  stepCount?: number;
}

/** Liveness flags for each sensor — drives the debug panel UI. */
export interface SensorAvailability {
  deviceMotion: boolean;
  accelerometer: boolean;
  magnetometer: boolean;
  barometer: boolean;
  pedometer: boolean;
}

/**
 * Raw sink callback (B1). Invoked once per real DeviceMotion tick (or
 * Accelerometer tick when DeviceMotion is unavailable) — i.e. at true sensor
 * cadence, NOT on a JS timer. `tMono` is a monotonic timestamp captured at the
 * instant the tick fired; consumers diff it against a per-walk baseline to get
 * a faithful relative `tMs`. The passed snapshot is the live `latestRef` and
 * MUST be consumed synchronously (copy the fields you need before yielding).
 */
export type RawSensorSink = (snapshot: SensorSnapshot, tMono: number) => void;

interface UseMotionSensorsResult {
  /** Synchronous accessor for the BLE scanner. Returns the latest fused snapshot. */
  latest: () => SensorSnapshot;
  /** Throttled live snapshot for UI rendering (~10 Hz). */
  live: SensorSnapshot;
  /** Which sensors actually subscribed successfully. */
  availability: SensorAvailability;
  /** Manual start — call when entering the collection workflow. */
  start: () => Promise<void>;
  /** Manual stop — call when leaving / unmounting. */
  stop: () => void;
  /**
   * Subscribe to every raw sensor tick (B1). Returns an unsubscribe fn. Use
   * this instead of polling `latest()` on your own interval when you need
   * timestamps faithful to the hardware's real sampling cadence.
   */
  subscribeRaw: (cb: RawSensorSink) => () => void;
}

// ── Lazy module loader ──

let _expoSensors: any = null;
let _expoSensorsUnavailable = false;

function getSensorsModule(): any {
  if (_expoSensorsUnavailable) return null;
  if (_expoSensors) return _expoSensors;
  try {
    _expoSensors = require("expo-sensors");
    return _expoSensors;
  } catch (e) {
    _expoSensorsUnavailable = true;
    console.warn("[Sensors] expo-sensors not available", e);
    return null;
  }
}

// ── Hook ──

const DEFAULT_SNAPSHOT: SensorSnapshot = {};
const UI_THROTTLE_MS = 100; // 10 Hz UI updates

export function useMotionSensors(opts?: {
  motionIntervalMs?: number;
  magIntervalMs?: number;
  barometerIntervalMs?: number;
}): UseMotionSensorsResult {
  const motionIntervalMs = opts?.motionIntervalMs ?? 50;
  const magIntervalMs = opts?.magIntervalMs ?? 50;
  const barometerIntervalMs = opts?.barometerIntervalMs ?? 200;

  const latestRef = useRef<SensorSnapshot>({ ...DEFAULT_SNAPSHOT });
  const [live, setLive] = useState<SensorSnapshot>({ ...DEFAULT_SNAPSHOT });
  const [availability, setAvailability] = useState<SensorAvailability>({
    deviceMotion: false,
    accelerometer: false,
    magnetometer: false,
    barometer: false,
    pedometer: false,
  });

  // Active subscriptions / timers — kept in refs so cleanup never lags state.
  const subsRef = useRef<{ remove: () => void }[]>([]);
  const stepWatchRef = useRef<{ remove: () => void } | null>(null);
  const uiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  // B1 raw event sinks — fired on every real sensor tick (see subscribeRaw).
  const rawSinksRef = useRef<Set<RawSensorSink>>(new Set());
  const emitRaw = useCallback(() => {
    if (rawSinksRef.current.size === 0) return;
    const snap = latestRef.current;
    const t = nowMonoMs();
    rawSinksRef.current.forEach((cb) => {
      try {
        cb(snap, t);
      } catch (e) {
        console.warn("[Sensors] raw sink threw", e);
      }
    });
  }, []);

  const subscribeRaw = useCallback((cb: RawSensorSink) => {
    rawSinksRef.current.add(cb);
    return () => {
      rawSinksRef.current.delete(cb);
    };
  }, []);

  // Gravity low-pass filter for fallback userAccel synthesis. On Android
  // devices that subscribe to DeviceMotion but always report 0 for
  // acceleration (no TYPE_LINEAR_ACCELERATION fusion sensor), we derive
  // linear acceleration ourselves: linAccel = (raw - gravityEMA) * 9.81.
  // gravityEMA tracks the low-frequency component of raw accel ≈ gravity.
  const gravityEmaRef = useRef<{ x: number; y: number; z: number; init: boolean }>({
    x: 0, y: 0, z: 0, init: false,
  });
  // "Hot" = DeviceMotion has produced a meaningfully non-zero userAccel
  // within the last second. If it stays cold for >1.5s after start, we
  // assume this device can't compute it and switch to the raw-accel fallback.
  const devMotionHotAtRef = useRef<number>(0);
  // Gravity LP alpha — smaller = slower gravity tracking (more sensitive to
  // brief motion). 0.05 ≈ 1s response @ 20 Hz updates.
  const G_ALPHA = 0.05;

  const latest = useCallback((): SensorSnapshot => latestRef.current, []);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    const Sensors = getSensorsModule();
    if (!Sensors) return;
    startedRef.current = true;

    const merge = (patch: Partial<SensorSnapshot>) => {
      latestRef.current = { ...latestRef.current, ...patch };
    };

    const next: SensorAvailability = {
      deviceMotion: false,
      accelerometer: false,
      magnetometer: false,
      barometer: false,
      pedometer: false,
    };

    // ── DeviceMotion (fused: attitude + userAccel + rotationRate + gravity) ──
    try {
      if (Sensors.DeviceMotion?.isAvailableAsync) {
        const ok = await Sensors.DeviceMotion.isAvailableAsync();
        if (ok) {
          await Sensors.DeviceMotion.setUpdateInterval(motionIntervalMs);
          const sub = Sensors.DeviceMotion.addListener((d: any) => {
            const ax = d.acceleration?.x;
            const ay = d.acceleration?.y;
            const az = d.acceleration?.z;
            // |userAccel| — orientation-independent step-intensity signal
            // (rest ≈ 0 m/s², walking peak 1.5–5 m/s²). Surface for the
            // debug panel so the dev can visually verify step peaks.
            const mag =
              ax != null && ay != null && az != null
                ? Math.sqrt(ax * ax + ay * ay + az * az)
                : undefined;
            // Mark DeviceMotion "hot" if it's actually producing real
            // (non-trivially non-zero) userAccel data. Some devices fire the
            // listener but always return ~0; in that case the Accelerometer
            // fallback below will populate userAccel instead.
            if (mag != null && mag > 0.05) {
              devMotionHotAtRef.current = Date.now();
            }
            // Only write userAccel here if the DeviceMotion fusion is
            // actually working. Otherwise the raw-accelerometer fallback
            // path will fill these fields with synthetic values.
            const devMotionWorks =
              Date.now() - devMotionHotAtRef.current < 1500;
            const patch: Partial<SensorSnapshot> = {
              pitch: d.rotation?.beta,
              roll: d.rotation?.gamma,
              yaw: d.rotation?.alpha,
              gyroX: d.rotationRate?.beta,
              gyroY: d.rotationRate?.gamma,
              gyroZ: d.rotationRate?.alpha,
            };
            if (devMotionWorks) {
              patch.userAccelX = ax;
              patch.userAccelY = ay;
              patch.userAccelZ = az;
              patch.userAccelMag = mag;
            }
            merge(patch);
            // B1: emit a raw tick at true DeviceMotion cadence.
            emitRaw();
          });
          subsRef.current.push(sub);
          next.deviceMotion = true;
        }
      }
    } catch (e) {
      console.warn("[Sensors] DeviceMotion unavailable", e);
    }

    // ── Accelerometer (raw, with gravity) ──
    try {
      if (Sensors.Accelerometer?.isAvailableAsync) {
        const ok = await Sensors.Accelerometer.isAvailableAsync();
        if (ok) {
          await Sensors.Accelerometer.setUpdateInterval(motionIntervalMs);
          const sub = Sensors.Accelerometer.addListener((d: any) => {
            const ax = typeof d.x === "number" ? d.x : 0;
            const ay = typeof d.y === "number" ? d.y : 0;
            const az = typeof d.z === "number" ? d.z : 0;

            // Update gravity low-pass estimate (raw accel ≈ gravity at rest)
            const g = gravityEmaRef.current;
            if (!g.init) {
              g.x = ax; g.y = ay; g.z = az; g.init = true;
            } else {
              g.x = (1 - G_ALPHA) * g.x + G_ALPHA * ax;
              g.y = (1 - G_ALPHA) * g.y + G_ALPHA * ay;
              g.z = (1 - G_ALPHA) * g.z + G_ALPHA * az;
            }

            const patch: Partial<SensorSnapshot> = {
              accelX: ax, accelY: ay, accelZ: az,
            };

            // Fallback userAccel: only fill if DeviceMotion isn't producing
            // real data (no hot-tick in the last 1.5s). On phones where
            // DeviceMotion works, this branch is skipped and DeviceMotion's
            // fused values win.
            const devMotionWorks =
              Date.now() - devMotionHotAtRef.current < 1500;
            if (!devMotionWorks) {
              // Raw accel is in g (1 g ≈ 9.81 m/s²). Gravity-remove then
              // convert to m/s² for parity with DeviceMotion units.
              const linX = (ax - g.x) * 9.81;
              const linY = (ay - g.y) * 9.81;
              const linZ = (az - g.z) * 9.81;
              patch.userAccelX = linX;
              patch.userAccelY = linY;
              patch.userAccelZ = linZ;
              patch.userAccelMag = Math.sqrt(linX * linX + linY * linY + linZ * linZ);
            }
            merge(patch);
            // B1 fallback: only drive raw ticks from the accelerometer when
            // DeviceMotion never subscribed (else we'd double-emit per cycle).
            if (!next.deviceMotion) emitRaw();
          });
          subsRef.current.push(sub);
          next.accelerometer = true;
        }
      }
    } catch (e) {
      console.warn("[Sensors] Accelerometer unavailable", e);
    }

    // ── Magnetometer (raw, uncalibrated) ──
    try {
      if (Sensors.Magnetometer?.isAvailableAsync) {
        const ok = await Sensors.Magnetometer.isAvailableAsync();
        if (ok) {
          await Sensors.Magnetometer.setUpdateInterval(magIntervalMs);
          const sub = Sensors.Magnetometer.addListener((d: any) => {
            merge({ magX: d.x, magY: d.y, magZ: d.z });
          });
          subsRef.current.push(sub);
          next.magnetometer = true;
        }
      }
    } catch (e) {
      console.warn("[Sensors] Magnetometer unavailable", e);
    }

    // ── Barometer ──
    try {
      if (Sensors.Barometer?.isAvailableAsync) {
        const ok = await Sensors.Barometer.isAvailableAsync();
        if (ok) {
          await Sensors.Barometer.setUpdateInterval(barometerIntervalMs);
          const sub = Sensors.Barometer.addListener((d: any) => {
            merge({ pressure: d.pressure, relativeAltitude: d.relativeAltitude });
          });
          subsRef.current.push(sub);
          next.barometer = true;
        }
      }
    } catch (e) {
      console.warn("[Sensors] Barometer unavailable", e);
    }

    // ── Pedometer (debug only — hardware step count) ──
    // `watchStepCount` callback gives CUMULATIVE steps since the watch
    // started (Expo normalises both platforms to this). Do NOT accumulate —
    // just store r.steps directly.
    try {
      if (Sensors.Pedometer?.isAvailableAsync) {
        const ok = await Sensors.Pedometer.isAvailableAsync();
        if (ok) {
          const watch = Sensors.Pedometer.watchStepCount((r: any) => {
            merge({ stepCount: r?.steps ?? 0 });
          });
          stepWatchRef.current = watch;
          merge({ stepCount: 0 });
          next.pedometer = true;
          console.log("[Sensors] Pedometer subscribed");
        } else {
          console.warn("[Sensors] Pedometer isAvailableAsync → false (check ACTIVITY_RECOGNITION permission)");
        }
      }
    } catch (e) {
      console.warn("[Sensors] Pedometer unavailable", e);
    }

    setAvailability(next);

    // UI throttle — copy latestRef into React state every 100 ms.
    uiTimerRef.current = setInterval(() => {
      setLive({ ...latestRef.current });
    }, UI_THROTTLE_MS);

    console.log("[Sensors] started", next);
  }, [motionIntervalMs, magIntervalMs, barometerIntervalMs, emitRaw]);

  const stop = useCallback(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    for (const s of subsRef.current) {
      try { s.remove(); } catch { /* ignore */ }
    }
    subsRef.current = [];
    if (stepWatchRef.current) {
      try { stepWatchRef.current.remove(); } catch { /* ignore */ }
      stepWatchRef.current = null;
    }
    if (uiTimerRef.current) {
      clearInterval(uiTimerRef.current);
      uiTimerRef.current = null;
    }
    latestRef.current = { ...DEFAULT_SNAPSHOT };
    gravityEmaRef.current = { x: 0, y: 0, z: 0, init: false };
    devMotionHotAtRef.current = 0;
    setLive({ ...DEFAULT_SNAPSHOT });
  }, []);

  // Safety net: tear down on unmount even if caller forgot to stop().
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { latest, live, availability, start, stop, subscribeRaw };
}
