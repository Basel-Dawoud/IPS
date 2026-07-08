/**
 * Per-variant configuration — the SINGLE place the deployed pipelines differ.
 *
 * navimind ships the full no-WiFi localizer suite (ported verbatim from the
 * GraduationProject research app; wifi_* variants are excluded because the
 * product app never collects WiFi RSSI):
 *   - without_wifi     : legacy count-5 GAT (corrupted export — A/B only).
 *   - nowifi_v3        : single-input temporal transformer, 1 s time window (default).
 *   - nowifi_20_2/15_2 : GAT + real beacon positions, gate 3 (2026-06).
 *   - nowifi_10_2/15_5 : NUM_BEACONS=7 retrains, real positions, gate 3.
 *   - *_upd            : "after_update" faithful-GELU retrains (run at gate 3).
 *   - trajectory       : self-supervised pretrained GAT, 5-row count window.
 *
 * The base per-row features and the beacon graph are computed identically for
 * every variant; what changes is the feature-column set, whether the model has a
 * beacon-graph branch, the window mode / size, the beacon-position flag, and the
 * StandardScaler / y stats — all captured here and in each bundled
 * `normalization.json`, so the rest of the pipeline stays column-order-agnostic.
 */
import nowifiNorm from "./norm/nowifi.json";
import nowifiV3Norm from "./norm/nowifi_v3.json";
import nowifi202Norm from "./norm/nowifi_20_2.json";
import nowifi152Norm from "./norm/nowifi_15_2.json";
import nowifi102Norm from "./norm/nowifi_10_2.json";
import nowifi155Norm from "./norm/nowifi_15_5.json";
import nowifi102UpdNorm from "./norm/nowifi_10_2_upd.json";
import nowifi155UpdNorm from "./norm/nowifi_15_5_upd.json";
import trajectoryNorm from "./norm/trajectory.json";

export type GatVariant =
  | "without_wifi"
  | "nowifi_v3"
  | "nowifi_20_2"
  | "nowifi_15_2"
  | "nowifi_10_2"
  | "nowifi_15_5"
  | "nowifi_10_2_upd"
  | "nowifi_15_5_upd"
  | "trajectory";

/** Which WiFi feature block (if any) the variant appends. None ship WiFi today. */
export type WifiKind = "none" | "v1" | "v2" | "geom";

/**
 * How the rolling window is bounded before a prediction.
 *   - "count": the model is fed the last `windowSize` consecutive rows, but the
 *     buffer keeps `aggregateDurationMs` of real time so the window STATISTICS
 *     are computed over the same ~1 s scope they had in training.
 *   - "time" : keep every row from the last `windowDurationMs` of real time, then
 *     pad/sub-sample to `windowSize` rows at inference (the v3 model). Mirrors the
 *     training pipeline's time-based windows (1 s window, 0.5 s stride).
 */
export type WindowMode = "count" | "time";

/** StandardScaler + y stats, read verbatim from a variant's normalization.json. */
export interface NormalizationConfig {
  feature_mean: number[];
  feature_scale: number[];
  feature_cols: string[];
  /** Beacon-graph scaler stats — absent for single-input variants (e.g. nowifi_v3). */
  graph_mean?: number[];
  graph_scale?: number[];
  y_mean: number;
  y_std: number;
  y_min: number;
  y_max: number;
  /**
   * Train-data median maps used by the median-difference features. Absent on
   * variants whose features keep the legacy 0 fallback.
   */
  beacon_median_rssi?: Record<string, number>;
  /** Keyed "beaconId:floorLevel" (e.g. "1:3"). */
  floor_beacon_median_rssi?: Record<string, number>;
  wifi_global_median?: number;
  /** Keyed by floor level (e.g. "3"). */
  wifi_floor_median?: Record<string, number>;
}

export interface GatModelConfig {
  variant: GatVariant;
  /** Short human label for the runtime model selector. */
  label: string;
  norm: NormalizationConfig;
  /** WiFi block to emit per row (none for all shipped variants). */
  wifiKind: WifiKind;
  /** Whether beacon `rssi_distance` (and everything derived) is clipped to <= 500. */
  clipRssiDistance: boolean;
  /**
   * Whether this variant was TRAINED with real beacon corridor positions in
   * `beacon_y_pos` / `weighted_beacon_y` / `strongest_beacon_y`. Variants trained
   * with BEACON_Y_POS empty saw a constant -1 in those columns; feeding them real
   * positions at inference is a large out-of-distribution input.
   */
  useBeaconYPos: boolean;
  /** Whether this variant consumes WiFi at all (drives whether we start the WiFi scanner). */
  usesWifi: boolean;
  /**
   * Whether the model has the dual `beacon_graph_input` (true for the GAT models)
   * or is a single-input temporal transformer (false for nowifi_v3). Single-input
   * models are fed only `sequence_input` and skip graph feature extraction.
   */
  hasGraphInput: boolean;
  /** Time-steps the model's `sequence_input` expects (5 / 10 for count, 48 for v3 time). */
  windowSize: number;
  /** How the rolling window is bounded (count of rows vs span of real time). */
  windowMode: WindowMode;
  /** "time" mode only: window span in ms (rows older than this are dropped). */
  windowDurationMs?: number;
  /** "count" mode only: span of the aggregate-stats buffer in ms. */
  aggregateDurationMs?: number;
  /** "time" mode only: recommended prediction cadence in ms (the training stride). */
  strideMs?: number;
  /**
   * Unique-beacon gate for emitting a prediction. Defaults to
   * MIN_BEACONS_PER_WINDOW (4); the gate-3 retrains predict from 3-beacon windows.
   */
  minBeacons?: number;
  /** Lazy require of the ONNX asset (Metro asset ref) — deferred so Metro only resolves on first load. */
  loadAsset: () => number;
}

export const GAT_CONFIGS: Record<GatVariant, GatModelConfig> = {
  // Legacy first no-wifi GAT. NOTE (from the research app): this asset was a
  // corrupted swish-clone export and should not be the default — kept only for
  // A/B comparison against the verified variants below.
  without_wifi: {
    variant: "without_wifi",
    label: "No WiFi (legacy)",
    norm: wrap(nowifiNorm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    // nowifi.json: beacon_y_pos mean=-1/scale=1 -> trained without positions.
    useBeaconYPos: false,
    windowSize: 5,
    windowMode: "count",
    aggregateDurationMs: 1000,
    loadAsset: () => require("../../../assets/models/gat_nowifi.onnx"),
  },
  nowifi_v3: {
    variant: "nowifi_v3",
    label: "No WiFi",
    norm: wrap(nowifiV3Norm),
    // Same 41-column no-WiFi feature set; verified re-export (2.54 m MAE offline).
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    // Single-input temporal transformer — no beacon_graph_input branch.
    hasGraphInput: false,
    // nowifi_v3.json: beacon_y_pos mean=-1/scale=1 -> trained without positions.
    useBeaconYPos: false,
    // Time-based 1 s window → 48 rows, predicted on a 0.5 s stride (both tunable live).
    windowSize: 48,
    windowMode: "time",
    windowDurationMs: 1000,
    strideMs: 500,
    loadAsset: () => require("../../../assets/models/gat_nowifi_v3.onnx"),
  },
  // ── No-wifi GAT with real beacon positions + medians + gate 3 (2026-06).
  // Count-mode, aggregate-stats buffer; floor exported as sigmoid(logit). ──
  nowifi_20_2: {
    variant: "nowifi_20_2",
    label: "No WiFi 20·2 (positions)",
    norm: wrap(nowifi202Norm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    useBeaconYPos: true,
    windowSize: 20,
    windowMode: "count",
    aggregateDurationMs: 1000,
    minBeacons: 3,
    loadAsset: () => require("../../../assets/models/gat_nowifi_20_2.onnx"),
  },
  nowifi_15_2: {
    variant: "nowifi_15_2",
    label: "No WiFi 15·2 (positions)",
    norm: wrap(nowifi152Norm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    useBeaconYPos: true,
    windowSize: 15,
    windowMode: "count",
    aggregateDurationMs: 1000,
    minBeacons: 3,
    loadAsset: () => require("../../../assets/models/gat_nowifi_15_2.onnx"),
  },

  nowifi_10_2: {
    variant: "nowifi_10_2",
    label: "No WiFi w10·s2",
    norm: wrap(nowifi102Norm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    useBeaconYPos: true,
    windowSize: 10,
    windowMode: "count",
    aggregateDurationMs: 1000,
    minBeacons: 3,
    loadAsset: () => require("../../../assets/models/gat_nowifi_10_2.onnx"),
  },
  nowifi_15_5: {
    variant: "nowifi_15_5",
    label: "No WiFi w15·s5 (positions)",
    norm: wrap(nowifi155Norm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    useBeaconYPos: true,
    windowSize: 15,
    windowMode: "count",
    aggregateDurationMs: 1000,
    minBeacons: 3,
    loadAsset: () => require("../../../assets/models/gat_nowifi_15_5.onnx"),
  },
  // ── "after_update" retrains (2026-06): same 41-col arch + real positions, but
  // trained with gate 4 (MIN_BEACONS_PER_WINDOW=4, vs the originals' 3). Faithful
  // GELU re-export (their package ONNX was a gelu→swish clone — never shipped);
  // ONNX==TF verified <1e-3, median maps injected. ──
  nowifi_10_2_upd: {
    variant: "nowifi_10_2_upd",
    label: "No WiFi w10·s2 (updated)",
    norm: wrap(nowifi102UpdNorm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    useBeaconYPos: true,
    windowSize: 10,
    windowMode: "count",
    aggregateDurationMs: 1000,
    // Training filter is 4, but the AI engineer is retraining at gate 3; app runs
    // at 3 now (more frequent updates) — re-export the gate-3 weights later.
    minBeacons: 3,
    loadAsset: () => require("../../../assets/models/gat_nowifi_10_2_upd.onnx"),
  },
  nowifi_15_5_upd: {
    variant: "nowifi_15_5_upd",
    label: "No WiFi w15·s5 (updated)",
    norm: wrap(nowifi155UpdNorm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    useBeaconYPos: true,
    windowSize: 15,
    windowMode: "count",
    aggregateDurationMs: 1000,
    // Training filter is 4, but the AI engineer is retraining at gate 3; app runs
    // at 3 now (more frequent updates) — re-export the gate-3 weights later.
    minBeacons: 3,
    loadAsset: () => require("../../../assets/models/gat_nowifi_15_5_upd.onnx"),
  },
  // Self-supervised pretrained-on-walks no-WiFi GAT. KEY: useBeaconYPos FALSE
  // (trained with BEACON_Y_POS empty). Faithful GELU export, ONNX==TF verified.
  trajectory: {
    variant: "trajectory",
    label: "Trajectory",
    norm: wrap(trajectoryNorm),
    wifiKind: "none",
    clipRssiDistance: false,
    usesWifi: false,
    hasGraphInput: true,
    useBeaconYPos: false,
    windowSize: 5,
    windowMode: "count",
    aggregateDurationMs: 1000,
    minBeacons: 3,
    loadAsset: () => require("../../../assets/models/gat_trajectory.onnx"),
  },
};

export const GAT_VARIANTS: GatVariant[] = [
  "without_wifi",
  "nowifi_v3",
  "nowifi_20_2",
  "nowifi_15_2",
  "nowifi_10_2",
  "nowifi_15_5",
  "nowifi_10_2_upd",
  "nowifi_15_5_upd",
  "trajectory",
];
// nowifi_v3 is the verified re-export (2.54 m MAE offline); the old without_wifi
// asset was a corrupted swish-clone export and should not be the default.
export const DEFAULT_GAT_VARIANT: GatVariant = "nowifi_v3";

export function getGatConfig(variant: GatVariant): GatModelConfig {
  return GAT_CONFIGS[variant];
}

/** JSON imports come back deeply-readonly; normalise to the mutable interface. */
function wrap(raw: unknown): NormalizationConfig {
  return raw as NormalizationConfig;
}
