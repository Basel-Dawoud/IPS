/**
 * StandardScaler application + output decoding — port of
 * `scaler.transform` / `scaler_g.transform` and the `RealTimeLocalizer`
 * de-normalisation / floor decode.
 *
 *   sequence : (x - feature_mean) / feature_scale, per column. The beaconId
 *              column has mean=0/scale=1 in the GAT configs (identity); the
 *              nowifi_v3 pipeline standardized it like any other column, so
 *              its real stats apply — matching its training exactly.
 *   graph    : (x - graph_mean) / graph_scale, per column.
 *   y        : clip(y_output * y_std + y_mean, Y_MIN, Y_MAX)
 *   floor    : FLOOR_CLASSES_INV[ floor_output >= 0.5 ? 1 : 0 ]
 */
import { FLOOR_CLASSES_INV, N_BEACON_FEATS, NUM_BEACONS, Y_MAX, Y_MIN } from "./constants";
import type { NormalizationConfig } from "./model-configs";

/** Guard against a zero scale (StandardScaler stores 1.0 for zero-variance cols anyway). */
function safeScale(s: number): number {
  return s === 0 || !Number.isFinite(s) ? 1 : s;
}

/**
 * Flatten + standardize the (windowSize x N) matrix into a row-major Float32Array
 * of length windowSize * N (the ONNX `sequence_input` payload). The row count is
 * taken from the matrix itself (5 for the original variants, 30 for v3).
 */
export function scaleSequence(matrix: number[][], norm: NormalizationConfig): Float32Array {
  const n = norm.feature_cols.length;
  const windowSize = matrix.length;
  const out = new Float32Array(windowSize * n);
  for (let r = 0; r < windowSize; r++) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < n; c++) {
      const v = row[c] ?? 0;
      out[r * n + c] = (v - norm.feature_mean[c]) / safeScale(norm.feature_scale[c]);
    }
  }
  return out;
}

/**
 * Flatten + standardize the (NUM_BEACONS x N_BEACON_FEATS) graph into a
 * row-major Float32Array (the ONNX `beacon_graph_input` payload).
 */
export function scaleGraph(graph: number[][], norm: NormalizationConfig): Float32Array {
  // Only called for variants with a graph branch, so these are present; guard
  // anyway since the fields are optional on the type (single-input variants omit them).
  const gMean = norm.graph_mean ?? [];
  const gScale = norm.graph_scale ?? [];
  // Node width is per-variant (6 classic, 8 for wifi_geom) — the scaler stats are
  // the source of truth for how many columns the model expects.
  const nFeats = gMean.length || N_BEACON_FEATS;
  const out = new Float32Array(NUM_BEACONS * nFeats);
  for (let r = 0; r < NUM_BEACONS; r++) {
    const row = graph[r] ?? [];
    for (let c = 0; c < nFeats; c++) {
      const v = row[c] ?? 0;
      out[r * nFeats + c] = (v - (gMean[c] ?? 0)) / safeScale(gScale[c]);
    }
  }
  return out;
}

/** De-normalize the linear y head and clip to the corridor range [0, 93]. */
export function decodeY(yNorm: number, norm: NormalizationConfig): number {
  const y = yNorm * norm.y_std + norm.y_mean;
  return Math.min(Math.max(y, Y_MIN), Y_MAX);
}

/** Decode the sigmoid floor head to a real floor level (3 or 4). */
export function decodeFloor(floorProb: number): number {
  return FLOOR_CLASSES_INV[floorProb >= 0.5 ? 1 : 0];
}
