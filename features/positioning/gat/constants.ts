/**
 * Shared contract for the dual-input GAT hybrid localizers
 * (Temporal Transformer + Beacon Graph Attention), ported from the Python
 * training pipeline (`engineer_features` / `create_single_sequence` /
 * `extract_beacon_graph_features` / `RealTimeLocalizer` / `StreamingLocalizer`).
 *
 * Everything in this file is IDENTICAL across all three deployed variants
 * (without_wifi / wifi_v1 / wifi_v2). The things that DIFFER per variant —
 * the feature-column set, the WiFi block, the `rssi_distance` clip, and the
 * StandardScaler / y stats — live in `model-configs.ts`, read straight from
 * each bundled `normalization.json`.
 */

// --- Sequence / graph dimensions ---
/**
 * Default time-steps per sequence for the original count-window variants
 * (without_wifi / wifi_v1 / wifi_v2). The real per-variant value is `windowSize`
 * in model-configs.ts — the v3 time-window model uses 30.
 */
export const WINDOW_SIZE = 5;
/** Graph nodes: index 0 = padding/unknown, 1..6 = the six physical beacons. */
export const NUM_BEACONS = 7;
/** Columns per graph node (`beacon_graph_input` is [batch, NUM_BEACONS, N_BEACON_FEATS]). */
export const N_BEACON_FEATS = 6;

// --- Gating ---
/** Emit a prediction only when the window holds >= this many unique beacons. */
export const MIN_BEACONS_PER_WINDOW = 4;

// --- RSSI -> distance model (log-distance path loss) ---
export const TX_POWER = -59;
export const PATH_LOSS = 2.0;
/** v2 clips both rssi_distance and wifi_rssi_distance to this upper bound. */
export const DISTANCE_CLIP = 500;

// --- Output range (corridor position, metres) ---
export const Y_MIN = 0;
export const Y_MAX = 93;

// --- Causal post-processing (RealTimeLocalizer defaults) ---
export const KALMAN_Q = 0.1;
export const KALMAN_R = 2.0;
export const MAD_WINDOW = 10;
export const MAD_Z = 3.0;

// --- IMU-fused post-process modes (motion_gated / pdr) ---
/** motion_gated: Q multiplier while walking — opens the gain up (K≈0.45) to cut lag. */
export const WALK_QSCALE = 5.0;
/** motion_gated: Q multiplier while standing still — clamps the gain down (K≈0.05) to kill jitter. */
export const STILL_QSCALE = 0.05;
/** pdr: default stride length (m) per detected step. */
export const STRIDE_M = 0.7;
/** pdr: Q multiplier at full walking confidence (process noise so the model can still correct the push). */
export const PDR_WALK_QSCALE = 3.0;
/**
 * pdr: hysteretic direction. `dirTrend` is a SLOW EMA of the model y-velocity; the
 * latent push direction flips only when |dirTrend| exceeds DIR_FLIP_THRESH, so a
 * momentary model lag/flip near a stop or turn doesn't reverse the dead-reckoned
 * push (avoids the output-feedback loop of a per-tick sign()).
 */
export const DIR_TREND_ALPHA = 0.1;
export const DIR_FLIP_THRESH = 0.2; // m per prediction on the slow trend
/**
 * pdr: guaranteed reversal. If the trend opposes the latent direction (even below
 * DIR_FLIP_THRESH) for this many consecutive predictions, flip anyway — so a slow
 * turn-around isn't stuck pointing the old way when noise never crosses the threshold.
 */
export const DIR_REVERSE_COUNT = 6;
/** pdr: min |trend| (m/predict) for an update to count toward a sustained reversal. */
export const DIR_REVERSE_MIN = 0.05;
/** pdr: only inject a step push when walking confidence clears this. */
export const PDR_MIN_CONF = 0.3;

// --- Constant-velocity (CV) post-process mode ("velocity") ---
// A 2-state [position, velocity] Kalman tracks a MOVING target without the
// systematic lag of the constant-position filter (which assumes you stand still).
// Process noise is the continuous white-noise-acceleration model; `accelStd` is
// gait-gated so we don't invent motion at a standstill and track pace while walking.
/** Accel std (m/s²) at full walking confidence — lets velocity adapt to pace. */
export const CV_ACCEL_WALK = 1.5;
/** Accel std (m/s²) when still — small so the filter doesn't drift. */
export const CV_ACCEL_STILL = 0.15;
/** BASE measurement variance (m²) of the model's raw y; scaled per-tick by R_k = base·beacon·innov. */
export const CV_R = 5.0;
/** dt clamp (s) so a scan gap can't blow up the process noise / coast. */
export const CV_DT_MIN = 0.05;
export const CV_DT_MAX = 3.0;
/** Soft-ZUPT velocity-decay time constant (s): v *= exp(−dt·(1−conf)/τ) — frame-rate independent. */
export const CV_TAU = 0.6;

// Adaptive measurement noise R_k = CV_R · beaconFactor · innovFactor (heteroscedastic BLE).
/** Beacon count at which beaconFactor == 1 (the per-floor gate count). */
export const CV_R_BEACON_REF = 4;
/** beaconFactor = clamp(REF / uniqueBeacons, MIN, MAX): more beacons → trust measurement more. */
export const CV_R_BEACON_MIN = 0.5;
export const CV_R_BEACON_MAX = 4.0;
/** EMA weight for the running innovation variance (drives innovFactor). */
export const CV_INNOV_ALPHA = 0.2;
/** innovFactor = clamp(innovEMA / CV_R, LO, HI) — clamped so a single spike can't dominate R. */
export const CV_INNOV_CLAMP_LO = 0.5;
export const CV_INNOV_CLAMP_HI = 4.0;

// Robustness.
/** dt (s) above which we re-initialize (inflate P, zero velocity) instead of coasting. */
export const CV_GAP_S = 5.0;
/** Innovation gate: squared Mahalanobis d² above this ⇒ down-weight. 2.5σ (χ²₁≈98.8%); a
 *  real BLE outlier (>~7 m here) is caught while a normal ~1–2 m step (d²≈0.5) passes. */
export const CV_GATE_D2 = 6.25;
/** When gated, multiply R by this (soft Huber down-weight) instead of hard-dropping the update. */
export const CV_GATE_R_INFLATE = 10.0;

// --- WiFi target access point (v1 / v2 only) ---
/** Both WiFi variants read only this single AP's RSSI. */
export const WIFI_BSSID = "ac:15:a2:1b:1c:a6";
/** RSSI used when the target AP is absent from a scan (matches training fill). */
export const WIFI_ABSENT_RSSI = -100;

/**
 * Beacon UID (lowercased) -> integer id used by the model (1..6).
 * Index 0 is reserved for padding/unknown beacons. Verified verbatim against
 * the training `BEACON_MAP`.
 */
export const BEACON_MAP: Record<string, number> = {
  "fda50693-a4e2-4fb1-afcf-c6eb07647825:1:1": 1,
  "fda50693-a4e2-4fb1-afcf-c6eb07647825:0:2": 2,
  "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:0:3": 3,
  "fda50693-a4e2-4fb1-afcf-c6eb07647825:10065:26049": 4,
  "fda50693-a4e2-4fb1-afcf-c6eb07647825:1:5": 5,
  "fda50693-a4e2-4fb1-afcf-c6eb07647825:1:6": 6,
};

/** Beacon id -> floor level it is mounted on. */
export const BEACON_FLOOR: Record<number, number> = {
  1: 3,
  2: 3,
  3: 3,
  4: 4,
  5: 4,
  6: 4,
};

/** Beacon id -> corridor y-position (metres). */
export const BEACON_Y_POS: Record<number, number> = {
  1: 65,
  2: 43.7,
  3: 21.4,
  4: 21.4,
  5: 43.7,
  6: 65,
};

/**
 * Beacon-position normalization stats for the wifi_geom variant's
 * `beacon_y_pos_norm` feature — mean/std of the six BEACON_Y_POS values,
 * verbatim from the training package's deployment_config.json.
 */
export const BEACON_Y_MEAN = 43.36666666666667;
export const BEACON_Y_STD = 17.801185977968498;

/** Model floor-class index (floor_output sigmoid >= 0.5 -> 1) -> real floor level. */
export const FLOOR_CLASSES_INV: Record<number, number> = { 0: 3, 1: 4 };

/** Allowed beacon UIDs (lowercased) — used to gate the BLE scanner. */
export const ALLOWED_BEACON_UIDS: string[] = Object.keys(BEACON_MAP);

/**
 * Total beacons configured for the model — the fallback denominator the Navigate
 * tab shows as "Beacons X/N" when the live building's registered beacon count is
 * unavailable (the six physical beacons).
 */
export const BEACON_TOTAL = Object.keys(BEACON_MAP).length;

/** ONNX I/O tensor names (identical across all 3 exports; bind by NAME, never index). */
export const SEQUENCE_INPUT = "sequence_input";
export const GRAPH_INPUT = "beacon_graph_input";
export const Y_OUTPUT = "y_output";
export const FLOOR_OUTPUT = "floor_output";

/** One IMU sample, in the exact units the model was trained on. */
export interface ImuSnapshot {
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  userAccelX: number;
  userAccelY: number;
  userAccelZ: number;
  magX: number;
  magY: number;
  magZ: number;
  pitch: number;
  roll: number;
  yaw: number;
}

/** Zeroed IMU snapshot (used when the sensor stack is unavailable). */
export const ZERO_IMU: ImuSnapshot = {
  gyroX: 0,
  gyroY: 0,
  gyroZ: 0,
  accelX: 0,
  accelY: 0,
  accelZ: 0,
  userAccelX: 0,
  userAccelY: 0,
  userAccelZ: 0,
  magX: 0,
  magY: 0,
  magZ: 0,
  pitch: 0,
  roll: 0,
  yaw: 0,
};

/**
 * A single beacon observation row fed into the rolling window. Beacons seen in
 * the same scan tick share a `capturedAt` so the per-timestamp group features
 * (rank / dominant / diff-to-max) stay meaningful.
 */
export interface ObservationRow {
  /** Mapped integer beacon id (1..6) from BEACON_MAP. */
  beaconId: number;
  /** Raw RSSI in dBm. */
  rssi: number;
  /** Group key — ms timestamp; rows from one scan tick share this. */
  capturedAt: number;
  /** IMU snapshot captured at this instant. */
  imu: ImuSnapshot;
  /** Target-AP WiFi level (dBm), or WIFI_ABSENT_RSSI when not seen / not scanning. */
  wifiRssi: number;
  /**
   * Optional floor override for beacon_floor_match. Live windows normally leave
   * this undefined — engineerWindow infers the window floor from its beacons
   * (majority vote), matching RealTimeLocalizer._prepare_window_df.
   */
  floorLevel?: number;
}

/** Map a beacon UID (any case) to its model integer id, or 0 if unknown. */
export function beaconIdForUid(uid: string): number {
  return BEACON_MAP[uid.toLowerCase()] ?? 0;
}

/**
 * Infer the most likely floor from the beacons currently in view — the
 * majority floor among recognized beacons. Mirrors
 * `RealTimeLocalizer._infer_floor_from_beacons` (defaults to floor 3).
 */
export function inferFloorFromBeacons(beaconIds: number[], fallback = 3): number {
  const counts: Record<number, number> = {};
  for (const b of beaconIds) {
    const f = BEACON_FLOOR[b];
    if (f !== undefined) counts[f] = (counts[f] ?? 0) + 1;
  }
  let best = fallback;
  let bestCount = 0;
  for (const f of Object.keys(counts)) {
    const c = counts[Number(f)];
    if (c > bestCount) {
      bestCount = c;
      best = Number(f);
    }
  }
  return best;
}
