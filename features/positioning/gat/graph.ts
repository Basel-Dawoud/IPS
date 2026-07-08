/**
 * Beacon graph builder — port of `extract_beacon_graph_features`.
 *
 * Produces the second model input (`beacon_graph_input`, NUM_BEACONS x
 * N_BEACON_FEATS): one profile row per beacon node for this window.
 *
 *   row b (node)         : clip(beaconId, 0, 6); row 0 = padding/unknown
 *   col 0 presence       : 1.0 if the beacon appeared this window
 *   col 1 mean rssi_norm
 *   col 2 std  rssi_norm : np.std (ddof=0, population); 0 if only one sample
 *   col 3 mean rssi_distance
 *   col 4 count ratio    : (#rows for this beacon) / len(X)  [len(X)=WINDOW_SIZE]
 *   col 5 mean motion_magnitude
 *
 * The wifi_geom variant trained with TWO extra node columns (nFeats = 8):
 *   col 6 mean beacon_y_pos_norm (standardized beacon corridor position)
 *   col 7 inverse distance weight: 1 / (mean rssi_distance + 0.1)
 *
 * IMPORTANT fidelity notes:
 *   - Built from the PADDED (WINDOW_SIZE-row) pre-normalisation matrix, exactly
 *     like the Python (graph is extracted AFTER np.pad), so edge-padded
 *     duplicate rows count toward presence/means and the count ratio uses 5.
 *   - Source columns are located BY NAME via the variant's feature_cols, so the
 *     six outputs are identical even though their source indices differ per
 *     variant.
 */
import { N_BEACON_FEATS, NUM_BEACONS } from "./constants";

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population std (np.std default, ddof=0). */
function populationStd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / n);
}

/**
 * @param matrix      padded WINDOW_SIZE x N pre-normalization feature matrix
 * @param beaconIds   padded length-WINDOW_SIZE raw beacon ids
 * @param featureCols the variant's column order (to find source columns by name)
 * @param nFeats      node columns (6 for the classic GAT variants, 8 for wifi_geom)
 */
export function extractBeaconGraph(
  matrix: number[][],
  beaconIds: number[],
  featureCols: string[],
  nFeats: number = N_BEACON_FEATS,
): number[][] {
  const feats: number[][] = Array.from({ length: NUM_BEACONS }, () =>
    new Array<number>(nFeats).fill(0),
  );

  const rssiNormIdx = featureCols.indexOf("rssi_norm");
  const rssiDistIdx = featureCols.indexOf("rssi_distance");
  const motionIdx = featureCols.indexOf("motion_magnitude");
  const yPosNormIdx = featureCols.indexOf("beacon_y_pos_norm");

  const len = matrix.length; // WINDOW_SIZE after padding
  if (len === 0) return feats;

  const clipped = beaconIds.map((b) => Math.max(0, Math.min(NUM_BEACONS - 1, Math.trunc(b))));

  for (let b = 0; b < NUM_BEACONS; b++) {
    const idxs: number[] = [];
    for (let i = 0; i < len; i++) if (clipped[i] === b) idxs.push(i);
    if (idxs.length === 0) continue; // node stays all-zero

    const rssiNormVals = rssiNormIdx >= 0 ? idxs.map((i) => matrix[i][rssiNormIdx]) : [];
    const rssiDistVals = rssiDistIdx >= 0 ? idxs.map((i) => matrix[i][rssiDistIdx]) : [];

    feats[b][0] = 1.0;
    feats[b][1] = mean(rssiNormVals);
    feats[b][2] = idxs.length > 1 ? populationStd(rssiNormVals) : 0.0;
    feats[b][3] = mean(rssiDistVals);
    feats[b][4] = idxs.length / len;
    if (motionIdx >= 0) feats[b][5] = mean(idxs.map((i) => matrix[i][motionIdx]));
    if (nFeats >= 8) {
      if (yPosNormIdx >= 0) feats[b][6] = mean(idxs.map((i) => matrix[i][yPosNormIdx]));
      feats[b][7] = 1.0 / (mean(rssiDistVals) + 0.1);
    }
  }

  return feats;
}
