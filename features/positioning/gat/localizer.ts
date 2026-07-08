/**
 * Real-time GAT localizer — port of `RealTimeLocalizer` + `StreamingLocalizer`.
 *
 * Maintains a rolling window of observation rows — bounded by the variant's
 * windowMode (last N rows for count variants, last windowDurationMs for the v3
 * time-window variant) — and on each `predict()`:
 *   1. gate: require >= MIN_BEACONS_PER_WINDOW unique beacons,
 *   2. engineer the (windowSize x N) sequence + (7x6) graph (pad / sub-sample),
 *   3. StandardScaler-normalize both, run ONNX (bound by name),
 *   4. de-normalize + clip y, decode floor,
 *   5. MAD outlier rejection -> causal 1-D Kalman.
 *
 * The floor head is returned as-is (not smoothed), matching the training code.
 */
import {
  DIR_FLIP_THRESH,
  DIR_REVERSE_COUNT,
  DIR_REVERSE_MIN,
  DIR_TREND_ALPHA,
  KALMAN_Q,
  KALMAN_R,
  MAD_WINDOW,
  MAD_Z,
  MIN_BEACONS_PER_WINDOW,
  ObservationRow,
  PDR_MIN_CONF,
  PDR_WALK_QSCALE,
  STILL_QSCALE,
  STRIDE_M,
  WALK_QSCALE,
} from "./constants";
import { beaconRFactor, CVFilter } from "./cv-filter";
import { engineerWindow } from "./feature-engineering";
import { extractBeaconGraph } from "./graph";
import { getGatConfig, type GatVariant } from "./model-configs";
import { decodeFloor, decodeY, scaleGraph, scaleSequence } from "./normalize";
import { runGat } from "./onnx-session";

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Causal 1-D Kalman filter. Constant-position by default; `update` accepts an
 * optional control input `u` (dead-reckoned displacement, for the pdr mode) and
 * a per-step `qScale` (process-noise multiplier, for the motion_gated mode). With
 * `u=0, qScale=1` it is bit-identical to the original constant-position filter.
 */
class OneDKalman {
  private x = 0;
  private P = 1;
  private initialized = false;

  constructor(
    private readonly Q = KALMAN_Q,
    private readonly R = KALMAN_R,
  ) {}

  reset(): void {
    this.x = 0;
    this.P = 1;
    this.initialized = false;
  }

  update(z: number, u = 0, qScale = 1): number {
    if (!this.initialized) {
      this.x = z;
      this.P = 1;
      this.initialized = true;
      return this.x;
    }
    const xPred = this.x + u;
    const PPred = this.P + this.Q * qScale;
    const K = PPred / (PPred + this.R);
    this.x = xPred + K * (z - xPred);
    this.P = (1 - K) * PPred;
    return this.x;
  }
}

/**
 * Median-Absolute-Deviation outlier rejector for the 1-D trajectory. The
 * incoming value is appended to the history BEFORE the test; a rejected value
 * still stays in the history (matching the Python), and the previously accepted
 * value is returned in its place.
 */
class MADOutlierRejector {
  private history: number[] = [];

  constructor(
    private readonly window = MAD_WINDOW,
    private readonly zThresh = MAD_Z,
  ) {}

  reset(): void {
    this.history = [];
  }

  update(value: number): number {
    this.history.push(value);
    if (this.history.length > this.window) this.history.shift();
    if (this.history.length < 3) return value;

    const med = median(this.history);
    const mad = median(this.history.map((v) => Math.abs(v - med)));
    if (mad < 1e-6) return value;

    const z = Math.abs(value - med) / (1.4826 * mad);
    if (z > this.zThresh) {
      return this.history.length >= 2 ? this.history[this.history.length - 2] : med;
    }
    return value;
  }
}

/** Post-processing mode applied to the model's y output. */
export type PostProcessMode = "kalman" | "motion_gated" | "pdr" | "velocity";

/** Per-tick motion signal from the IMU gait detector (for the IMU-fused modes). */
export interface MotionContext {
  /** Gait classifier reports walking (boolean, for display/legacy). */
  isWalking: boolean;
  /** Steps detected since the previous prediction. */
  steps: number;
  /** Continuous walking confidence (0–1) — drives the soft Kalman gain. */
  walkingConfidence: number;
}

export interface GatPrediction {
  /** Smoothed corridor position in metres (post-process output). */
  y: number;
  /** Decoded + clipped y before MAD/post-process (the model's raw take). */
  yRaw: number;
  /** Real floor level (3 or 4). */
  floor: number;
  /** Floor head sigmoid probability. */
  floorProb: number;
  /** Real (pre-padding) rows used. */
  bufferSize: number;
  /** Unique beacons in the window. */
  uniqueBeacons: number;
  /** Post-process mode that produced `y`. */
  mode: PostProcessMode;
  /** Whether the IMU step detector reported walking this tick. */
  isWalking: boolean;
  /** pdr only: signed step displacement (m) injected this tick (debug). */
  pdrStep: number;
}

export class GatLocalizer {
  private buffer: ObservationRow[] = [];
  private readonly kalman = new OneDKalman();
  /** Constant-velocity smoother for the "velocity" mode (tracks a moving target). */
  private readonly cvKalman = new CVFilter();
  /** capturedAt (ms) of the previous prediction — gives the CV filter its dt. */
  private lastPredictAt: number | null = null;
  private readonly mad = new MADOutlierRejector();
  private variant: GatVariant;
  /** Runtime override of the time-window span (ms); falls back to the config default. */
  private windowDurationMsOverride?: number;
  /** Active post-process mode (navimind ships the PDR dead-reckoning smoother). */
  private postProcessMode: PostProcessMode = "pdr";
  /** Per-step stride length (m) for the pdr mode. */
  private strideM = STRIDE_M;
  /** Slow EMA of model-y velocity (m/predict) — drives the hysteretic pdr direction. */
  private dirTrend = 0;
  /** Latent pdr push direction (−1/0/+1); flips on a strong trend or a sustained opposite one. */
  private pdrDir = 0;
  /** Consecutive predictions whose trend opposes pdrDir — drives the guaranteed reversal. */
  private dirOppositeCount = 0;
  /** Previous raw y, for the velocity trend. */
  private prevYRaw: number | null = null;

  constructor(variant: GatVariant) {
    this.variant = variant;
  }

  getPostProcessMode(): PostProcessMode {
    return this.postProcessMode;
  }

  /** Switch post-process mode; resets the smoother so the dot doesn't jump on switch. */
  setPostProcessMode(mode: PostProcessMode): void {
    if (mode === this.postProcessMode) return;
    this.postProcessMode = mode;
    this.kalman.reset();
    this.cvKalman.reset();
    this.lastPredictAt = null;
    this.mad.reset();
    this.dirTrend = 0;
    this.pdrDir = 0;
    this.dirOppositeCount = 0;
    this.prevYRaw = null;
  }

  /** Set the pdr stride length in metres (live tuning). */
  setStride(m: number): void {
    this.strideM = m;
  }

  getVariant(): GatVariant {
    return this.variant;
  }

  /** Switch model variant; resets the buffer + filters + window override (caller re-warms the session). */
  setVariant(variant: GatVariant): void {
    if (variant === this.variant) return;
    this.variant = variant;
    this.windowDurationMsOverride = undefined;
    this.reset();
  }

  /** Override the time-window span (ms) for "time" mode variants. Pass undefined to revert to config. */
  setWindowDurationMs(ms: number | undefined): void {
    this.windowDurationMsOverride = ms;
  }

  reset(): void {
    this.buffer = [];
    this.kalman.reset();
    this.cvKalman.reset();
    this.lastPredictAt = null;
    this.mad.reset();
    this.dirTrend = 0;
    this.pdrDir = 0;
    this.dirOppositeCount = 0;
    this.prevYRaw = null;
  }

  /**
   * Append one observation row. The buffer is time-bounded for every variant:
   *   - time mode : keep every row from the last `windowDurationMs` — the whole
   *     buffer becomes the model window (pad / sub-sample to windowSize).
   *   - count mode: keep the last `aggregateDurationMs` so the window STATISTICS
   *     match their training scope (~1 s recording chunks); the model itself is
   *     fed only the last `windowSize` consecutive rows (see engineerWindow).
   * Both spans are runtime-overridable via setWindowDurationMs, with a generous
   * hard cap so a stale clock can't grow the buffer without bound.
   */
  addObservation(row: ObservationRow): void {
    this.buffer.push(row);
    const cfg = getGatConfig(this.variant);
    const durationMs =
      this.windowDurationMsOverride ??
      (cfg.windowMode === "time"
        ? (cfg.windowDurationMs ?? 1000)
        : (cfg.aggregateDurationMs ?? 1000));
    const cutoff = row.capturedAt - durationMs;
    while (this.buffer.length > 0 && this.buffer[0].capturedAt < cutoff) {
      this.buffer.shift();
    }
    const hardCap = Math.max(cfg.windowSize * 8, 64);
    while (this.buffer.length > hardCap) this.buffer.shift();
  }

  /** Append a batch of rows sharing one capturedAt (one scan tick). */
  addObservations(rows: ObservationRow[]): void {
    for (const r of rows) this.addObservation(r);
  }

  get bufferSize(): number {
    return this.buffer.length;
  }

  get uniqueBeacons(): number {
    return new Set(this.buffer.map((r) => r.beaconId)).size;
  }

  /**
   * Run inference on the current buffer. Returns null when the >=4-unique-beacon
   * gate is unmet or the ONNX runtime is unavailable.
   */
  async predict(motion?: MotionContext): Promise<GatPrediction | null> {
    const config = getGatConfig(this.variant);
    // Per-variant gate (defaults to 4; the nowifi_*_2 models trained with 3).
    const minBeacons = config.minBeacons ?? MIN_BEACONS_PER_WINDOW;
    const eng = engineerWindow(this.buffer, config);
    if (eng.nReal === 0 || eng.uniqueBeacons < minBeacons) return null;
    // Count mode: training rejected slices below the gate, so the model never saw
    // such inputs — gate on the emitted slice, not just the buffer.
    if (config.windowMode === "count" && eng.uniqueBeaconsEmitted < minBeacons) {
      return null;
    }

    const sequence = scaleSequence(eng.matrix, config.norm);
    // Single-input variants (nowifi_v3) have no beacon-graph branch — skip it.
    let graphScaled: Float32Array | null = null;
    if (config.hasGraphInput) {
      const nGraphFeats = config.norm.graph_mean?.length || undefined;
      const graph = extractBeaconGraph(eng.matrix, eng.beaconIds, eng.featureCols, nGraphFeats);
      graphScaled = scaleGraph(graph, config.norm);
    }

    const raw = await runGat(this.variant, sequence, graphScaled, eng.featureCols.length);
    if (!raw) return null;

    const yRaw = decodeY(raw.yNorm, config.norm);
    const floor = decodeFloor(raw.floorProb);

    const yClean = this.mad.update(yRaw);

    // Slow model-velocity trend → hysteretic pdr direction. A SLOW EMA (not a
    // per-tick derivative) plus a flip threshold means a momentary model lag/flip
    // near a stop or turn won't reverse the dead-reckoned push.
    const instVel = this.prevYRaw === null ? 0 : yRaw - this.prevYRaw;
    this.prevYRaw = yRaw;
    this.dirTrend = DIR_TREND_ALPHA * instVel + (1 - DIR_TREND_ALPHA) * this.dirTrend;
    if (this.dirTrend > DIR_FLIP_THRESH) {
      this.pdrDir = 1;
      this.dirOppositeCount = 0;
    } else if (this.dirTrend < -DIR_FLIP_THRESH) {
      this.pdrDir = -1;
      this.dirOppositeCount = 0;
    } else if (this.pdrDir !== 0 && Math.sign(this.dirTrend) === -this.pdrDir && Math.abs(this.dirTrend) > DIR_REVERSE_MIN) {
      // Trend opposes the held direction but is below the flip threshold; if this
      // persists, flip anyway (guaranteed reversal on a slow turn-around).
      if (++this.dirOppositeCount >= DIR_REVERSE_COUNT) {
        this.pdrDir = -this.pdrDir;
        this.dirOppositeCount = 0;
      }
    } else {
      this.dirOppositeCount = 0; // trend agrees or is negligible → reset the reversal counter
    }

    const isWalking = motion?.isWalking ?? false;
    const conf = Math.max(0, Math.min(1, motion?.walkingConfidence ?? 0));
    let pdrStep = 0;
    let ySmooth: number;

    switch (this.postProcessMode) {
      case "motion_gated":
        // Soft gain: lerp Q-scale by walking confidence (still→heavy smoothing,
        // walking→responsive) rather than a hard binary switch.
        ySmooth = this.kalman.update(yClean, 0, STILL_QSCALE + (WALK_QSCALE - STILL_QSCALE) * conf);
        break;
      case "pdr": {
        // Dead-reckon forward by the detected steps in the latent (hysteretic)
        // travel direction; the model corrects absolute drift. Push only when
        // walking confidence is real; Q-scale lerps with confidence.
        const steps = motion?.steps ?? 0;
        pdrStep = conf > PDR_MIN_CONF ? steps * this.strideM * this.pdrDir : 0;
        ySmooth = this.kalman.update(yClean, pdrStep, 1 + (PDR_WALK_QSCALE - 1) * conf);
        break;
      }
      case "velocity": {
        // Constant-velocity tracking — predicts forward by the estimated walking
        // speed so a steady walk has no systematic lag. dt = real time since the
        // last prediction (from the tick's capturedAt). The CVFilter is gait-gated
        // (accel noise + soft ZUPT from `conf`) and heteroscedastic-aware: the
        // measurement-noise R is scaled by the unique-beacon count (sparse BLE ⇒
        // trust the measurement less) plus a soft innovation gate on bad ticks.
        const tickAt = this.buffer.length ? this.buffer[this.buffer.length - 1].capturedAt : 0;
        const dt = this.lastPredictAt == null ? 1 : (tickAt - this.lastPredictAt) / 1000;
        this.lastPredictAt = tickAt;
        ySmooth = this.cvKalman.update(yClean, dt, conf, beaconRFactor(eng.uniqueBeacons));
        break;
      }
      case "kalman":
      default:
        ySmooth = this.kalman.update(yClean);
        break;
    }

    return {
      y: ySmooth,
      yRaw,
      floor,
      floorProb: raw.floorProb,
      bufferSize: eng.nReal,
      uniqueBeacons: eng.uniqueBeacons,
      mode: this.postProcessMode,
      isWalking,
      pdrStep,
    };
  }
}
