/**
 * Live positioning hook — drives the dual-input GAT hybrid localizer.
 *
 * Pipeline (every `tickMs` ms while active):
 *   1. Read per-beacon mean RSSI over the last `windowMs` from the BLE scanner.
 *   2. Snapshot the IMU (`motion.latest()`) + the target-AP WiFi level once for
 *      this tick, and emit one ObservationRow per visible allowed beacon (all
 *      sharing this tick's `capturedAt`, so the per-timestamp graph/group
 *      features stay meaningful).
 *   3. Push the rows into the localizer's rolling 5-row buffer.
 *   4. `localizer.predict()` engineers the window, runs ONNX (bound by name),
 *      de-normalizes + clips y, decodes floor, then MAD-rejects + Kalman-smooths.
 *
 * The Kalman filter inside the localizer replaces the old EMA smoother. The
 * model is a 1-D corridor localizer: it returns `y` (0..93 m) + `floor` (3/4);
 * `x` is a fixed corridor constant applied by the UI.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED_BEACON_UIDS,
  beaconIdForUid,
  DEFAULT_GAT_VARIANT,
  GatLocalizer,
  getGatConfig,
  isOrtAvailable,
  type GatVariant,
  type ImuSnapshot,
  type MotionContext,
  type ObservationRow,
  type PostProcessMode,
  warmSession,
  WIFI_ABSENT_RSSI,
} from "./gat";
import { getWindowMeans, startContinuousScan, stopContinuousScan } from "../ble/ble-scanner";
import { requestBlePermissions } from "../ble/permissions";
import { useMotionSensors, type SensorSnapshot } from "@/hooks/use-motion-sensors";
import {
  getTargetRssi,
  startWifiScanning,
  stopWifiScanning,
} from "@/features/wifi/wifi-scanner";

export interface UsePositioningOptions {
  /** Trailing slice averaged per beacon into each tick's rows, in ms. Default 1000. */
  windowMs?: number;
  /** Interval between inference attempts, in ms. Default 1000. */
  tickMs?: number;
  /** Initial GAT variant. Default `nowifi_v3`. */
  initialVariant?: GatVariant;
  /** Auto-start on mount. Default false. */
  autoStart?: boolean;
}

export interface PositioningState {
  active: boolean;
  ready: boolean;
  available: boolean;
  /** Real (pre-padding) rows in the current window. */
  bufferSize: number;
  /** Unique beacons in the window — the >=4 gate metric. */
  uniqueBeacons: number;
  /** Smoothed corridor position in metres (Kalman), or null before first fix. */
  y: number | null;
  /** Decoded + clipped y before MAD/Kalman. */
  yRaw: number | null;
  /** Predicted floor level (3 or 4), or null. */
  floor: number | null;
  /** Floor-head sigmoid probability. */
  floorProb: number | null;
  /** Active model variant. */
  variant: GatVariant;
  /** Active post-process smoother (pdr default). */
  postProcessMode: PostProcessMode;
  error: string | null;
}

const ALLOWED_UIDS = new Set(ALLOWED_BEACON_UIDS);

/** Copy a (mutable, live) sensor snapshot into a complete, immutable IMU row. */
function toImu(s: SensorSnapshot): ImuSnapshot {
  return {
    gyroX: s.gyroX ?? 0,
    gyroY: s.gyroY ?? 0,
    gyroZ: s.gyroZ ?? 0,
    accelX: s.accelX ?? 0,
    accelY: s.accelY ?? 0,
    accelZ: s.accelZ ?? 0,
    userAccelX: s.userAccelX ?? 0,
    userAccelY: s.userAccelY ?? 0,
    userAccelZ: s.userAccelZ ?? 0,
    magX: s.magX ?? 0,
    magY: s.magY ?? 0,
    magZ: s.magZ ?? 0,
    pitch: s.pitch ?? 0,
    roll: s.roll ?? 0,
    yaw: s.yaw ?? 0,
  };
}

export function usePositioning(options: UsePositioningOptions = {}) {
  const {
    windowMs = 1000,
    tickMs = 1000,
    initialVariant = DEFAULT_GAT_VARIANT,
    autoStart = false,
  } = options;

  const localizerRef = useRef(new GatLocalizer(initialVariant));

  const [state, setState] = useState<PositioningState>({
    active: false,
    ready: false,
    available: isOrtAvailable(),
    bufferSize: 0,
    uniqueBeacons: 0,
    y: null,
    yRaw: null,
    floor: null,
    floorProb: null,
    variant: initialVariant,
    postProcessMode: localizerRef.current.getPostProcessMode(),
    error: null,
  });

  const variantRef = useRef<GatVariant>(initialVariant);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Running pedometer baseline so each tick gets the steps since the previous one.
  const lastStepCountRef = useRef(0);
  // Wall-clock of the previous step read — bounds how many steps one tick may inject.
  const lastStepReadAtRef = useRef(0);
  // Wall-clock of the last inference — gates the prediction cadence for the
  // time-window variant (nowifi_v3): dense ticks fill the window, predict per stride.
  const lastPredictAtRef = useRef(0);
  const motion = useMotionSensors({ motionIntervalMs: 50, magIntervalMs: 50, enableLiveUpdates: false });

  // Warm the ONNX session for the active variant whenever it changes.
  useEffect(() => {
    if (!state.available) return;
    let cancelled = false;
    warmSession(state.variant)
      .then((s) => !cancelled && setState((p) => ({ ...p, ready: !!s, error: s ? null : "session null" })))
      .catch((err) => !cancelled && setState((p) => ({ ...p, ready: false, error: String(err) })));
    return () => {
      cancelled = true;
    };
  }, [state.available, state.variant]);

  const stop = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    stopContinuousScan();
    stopWifiScanning();
    motion.stop();
    localizerRef.current.reset();
    setState((p) => ({ ...p, active: false, bufferSize: 0, uniqueBeacons: 0 }));
  }, [motion]);

  // One sensor→model tick. For the time-window variant (nowifi_v3) ticks fire
  // densely (every TIME_SAMPLE_MS) so the 1 s window fills to its 48 rows, and a
  // prediction is run only once per stride; count variants add + predict per tick.
  const runTick = useCallback(async () => {
    const cfg = getGatConfig(variantRef.current);
    const isTimeWindow = cfg.windowMode === "time";

    // Time variants read a SHORT per-tick mean so successive ticks carry real
    // temporal variation across the window (rather than each averaging the whole
    // second into near-identical rows).
    const readWindowMs = isTimeWindow ? Math.min(windowMs, 250) : windowMs;
    const means = getWindowMeans(readWindowMs);
    if (means.size === 0) return;

    const capturedAt = Date.now();
    const snap = motion.latest();
    const imu = toImu(snap);
    const wifiRssi = cfg.usesWifi ? getTargetRssi() : WIFI_ABSENT_RSSI;

    const rows: ObservationRow[] = [];
    means.forEach((rssi, uid) => {
      const beaconId = beaconIdForUid(uid);
      if (beaconId > 0 && Number.isFinite(rssi)) {
        rows.push({ beaconId, rssi, capturedAt, imu, wifiRssi });
      }
    });
    if (rows.length === 0) return;

    const localizer = localizerRef.current;
    localizer.addObservations(rows);



    // Time variants: add every dense sample to the window, but run inference only
    // once per stride. Count variants fall through and predict every tick.
    if (isTimeWindow && Date.now() - lastPredictAtRef.current < (cfg.strideMs ?? 500)) {
      return;
    }
    lastPredictAtRef.current = Date.now();

    try {
      // Steps since the previous prediction drive the PDR dead-reckoning.
      const stepNow = snap.stepCount ?? 0;
      const rawSteps = Math.max(0, stepNow - lastStepCountRef.current);
      lastStepCountRef.current = stepNow;
      // The hardware pedometer batches: after a stop→walk transition the OS
      // holds ~10–20 steps until it confirms walking, then flushes them in one
      // callback. Those steps happened in the past, so dead-reckoning all of
      // them into THIS tick lurches the position forward. Cap the injection to
      // a physiological rate over the elapsed interval and drop the stale rest.
      const nowWall = Date.now();
      const sinceMs = lastStepReadAtRef.current > 0
        ? Math.min(5000, nowWall - lastStepReadAtRef.current)
        : 1000;
      lastStepReadAtRef.current = nowWall;
      const maxSteps = Math.max(1, Math.ceil(sinceMs / 300)); // ≤ ~3.3 steps/s
      const steps = Math.min(rawSteps, maxSteps);
      const conf = steps > 0 ? 1 : 0;
      const motionCtx: MotionContext = { isWalking: steps > 0, steps, walkingConfidence: conf };

      const pred = await localizer.predict(motionCtx);
      if (!pred) return;
      setState((p) => ({
        ...p,
        y: pred.y,
        yRaw: pred.yRaw,
        floor: pred.floor,
        floorProb: pred.floorProb,
        bufferSize: pred.bufferSize,
        uniqueBeacons: pred.uniqueBeacons,
      }));
    } catch (err) {
      console.warn("[positioning] inference failed:", err);
    }
  }, [windowMs, motion]);

  // (Re)start the tick loop at the cadence the active variant needs: dense
  // sampling for the time-window model, the configured interval for count models.
  const startLoop = useCallback(() => {
    if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    const TIME_SAMPLE_MS = 150;
    const isTimeWindow = getGatConfig(variantRef.current).windowMode === "time";
    const period = isTimeWindow ? TIME_SAMPLE_MS : tickMs;
    lastPredictAtRef.current = 0;
    tickTimerRef.current = setInterval(() => {
      void runTick();
    }, period);
  }, [runTick, tickMs]);

  const start = useCallback(async () => {
    if (tickTimerRef.current) return true;

    const granted = await requestBlePermissions();
    if (!granted) {
      setState((p) => ({ ...p, error: "BLE permission denied" }));
      return false;
    }

    const ok = startContinuousScan({ maxBufferAgeMs: 5_000, allowedUids: ALLOWED_UIDS });
    if (!ok) {
      setState((p) => ({ ...p, error: "BLE unavailable" }));
      return false;
    }

    await motion.start();
    if (getGatConfig(variantRef.current).usesWifi) startWifiScanning();

    localizerRef.current.reset();
    lastStepCountRef.current = motion.latest().stepCount ?? 0;
    setState((p) => ({ ...p, active: true, error: null, bufferSize: 0, uniqueBeacons: 0 }));

    startLoop();
    return true;
  }, [startLoop, motion]);

  useEffect(() => {
    if (autoStart) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Switch GAT variant at runtime — resets the buffer/filters and re-warms the session. */
  const setVariant = useCallback((variant: GatVariant) => {
    if (variant === variantRef.current) return;
    const wasActive = !!tickTimerRef.current;
    variantRef.current = variant;
    localizerRef.current.setVariant(variant);

    // Reconcile the WiFi scanner + tick cadence with the new variant (while active).
    if (wasActive) {
      if (getGatConfig(variant).usesWifi) startWifiScanning();
      else stopWifiScanning();
      startLoop();
    }

    setState((p) => ({
      ...p,
      variant,
      bufferSize: 0,
      uniqueBeacons: 0,
      y: null,
      yRaw: null,
      floor: null,
      floorProb: null,
    }));
  }, [startLoop]);

  /** Switch the post-process smoother at runtime (pdr / kalman / motion_gated). */
  const setPostProcessMode = useCallback((mode: PostProcessMode) => {
    localizerRef.current.setPostProcessMode(mode);
    setState((p) => ({ ...p, postProcessMode: mode }));
  }, []);

  /** Set the PDR stride length (metres). */
  const setStride = useCallback((metres: number) => {
    localizerRef.current.setStride(metres);
  }, []);

  return { ...state, start, stop, setVariant, setPostProcessMode, setStride };
}
