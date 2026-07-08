/**
 * Per-row feature engineering for one window — a faithful port of the Python
 * `preprocess_data` + `engineer_features` + the projection in
 * `create_single_sequence`, fused into a single pass over the rolling buffer.
 *
 * Design is COLUMN-ORDER-AGNOSTIC: every feature is computed into a
 * `Record<name, number>` per row, then projected onto the variant's
 * `feature_cols`. The 41 / 47 / 46 widths, WiFi placement, and the
 * `rssi_distance` clip are pure per-variant config (see model-configs.ts).
 *
 * Grouping semantics (verified against the training code):
 *   - "window" group  = all rows in the buffer (the per-(session,fp,window)
 *     group in training). Drives window_rssi_mean/std, beacon_count,
 *     unique_beacon_count, weighted_beacon_y, rel_time, window_progress.
 *   - "timestamp" group = rows sharing a capturedAt (one scan tick). Drives
 *     beacon_signal_rank, min_beacon_distance, dominant_beacon_id,
 *     rssi_diff_to_max, rssi_diff_to_2nd_max, strongest_beacon_y.
 *
 * Median-dependent features (rssi_diff_from_beacon_median, rssi_vs_floor_median,
 * and v1's wifi_vs_*_median) are computed against the train-data median maps in
 * the variant's normalization.json when present. Training DID use real medians
 * (the Python `else 0.0` branch only ran when no map was passed, which never
 * happened in the v3 pipelines), so the maps were back-filled into the v3 norm
 * files; variants without maps keep the legacy 0 fallback.
 *
 * beacon_y_pos / weighted_beacon_y / strongest_beacon_y are emitted as -1 for
 * variants trained with BEACON_Y_POS empty (see useBeaconYPos in model-configs).
 */
import {
  BEACON_FLOOR,
  BEACON_Y_MEAN,
  BEACON_Y_POS,
  BEACON_Y_STD,
  DISTANCE_CLIP,
  inferFloorFromBeacons,
  ObservationRow,
  PATH_LOSS,
  TX_POWER,
  WIFI_ABSENT_RSSI,
} from "./constants";
import type { GatModelConfig, WifiKind } from "./model-configs";

export type FeatureRow = Record<string, number>;

export interface EngineeredWindow {
  /** windowSize x N pre-normalization matrix, projected onto feature_cols (edge-padded / sub-sampled). */
  matrix: number[][];
  /** Length-windowSize raw beacon ids (1..6), padded / sub-sampled to match `matrix`. */
  beaconIds: number[];
  /** Number of real (pre-padding) rows. */
  nReal: number;
  /** Unique beacon-id count among the real rows — the >=4 gate metric. */
  uniqueBeacons: number;
  /**
   * Unique beacon-id count among the EMITTED rows (the last windowSize rows for
   * count mode). Training rejected 5-row slices below 4 uniques, so count-mode
   * predictions gate on this rather than the buffer-wide count.
   */
  uniqueBeaconsEmitted: number;
  /** The variant's feature column order (so the graph can index by name). */
  featureCols: string[];
}

/** log-distance path-loss range model; v2 clamps to <= 500. */
function rssiToDistance(rssi: number, clip: boolean): number {
  const d = Math.pow(10, (TX_POWER - rssi) / (10 * PATH_LOSS));
  return clip ? Math.min(d, DISTANCE_CLIP) : d;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** pandas `.std()` (sample / ddof=1); 0 when fewer than 2 samples (fillna(0)). */
function sampleStd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (n - 1));
}

/** Write the variant's WiFi block into a row dict. `w` is the target-AP level (dBm). */
function applyWifiBlock(
  row: FeatureRow,
  w: number,
  kind: WifiKind,
  config: GatModelConfig,
  assumedFloor: number,
): void {
  if (kind === "v1") {
    // v1: wifi_rssi is its own column; wifi_distance is NOT clipped.
    row.wifi_rssi = w;
    row.wifi_rssi_norm = (w + 100) / 60;
    row.wifi_rssi_inv = -w;
    row.wifi_distance = Math.pow(10, (TX_POWER - w) / (10 * PATH_LOSS));
    // Train-data medians from normalization.json; 0 when not exported. The
    // unknown-floor fallback is `w` (diff 0), matching the Python fillna.
    const wifiGlobal = config.norm.wifi_global_median;
    row.wifi_vs_global_median = wifiGlobal != null ? w - wifiGlobal : 0;
    const wifiFloor = config.norm.wifi_floor_median;
    row.wifi_vs_floor_median = wifiFloor ? w - (wifiFloor[String(assumedFloor)] ?? w) : 0;
  } else if (kind === "v2") {
    // v2-style block (wifi_v1_20 lineage): the raw level IS the feature;
    // wifi_rssi_distance is clipped <= 500.
    row.wifi_ac_15_a2_1b_1c_a6 = w;
    row.wifi_rssi_norm = (w + 100) / 60;
    row.wifi_rssi_inv = -w;
    row.wifi_present = w > WIFI_ABSENT_RSSI ? 1 : 0;
    row.wifi_rssi_distance = Math.min(Math.pow(10, (TX_POWER - w) / (10 * PATH_LOSS)), DISTANCE_CLIP);
  } else if (kind === "geom") {
    // wifi_geom: training imputed missing wifi (ffill/median) and kept a separate
    // missing flag. Live equivalent: flag absence, substitute the train-data
    // global median so the raw/norm/inv columns stay in-distribution.
    const missing = w <= WIFI_ABSENT_RSSI ? 1 : 0;
    const wf = missing ? (config.norm.wifi_global_median ?? w) : w;
    row.wifi_ac_15_a2_1b_1c_a6 = wf;
    row.wifi_norm = (wf + 100) / 60;
    row.wifi_inv = -wf;
    row.wifi_missing = missing;
  }
}

/**
 * Build the sequence matrix + beacon-id vector for one window.
 *
 * Window aggregates are computed over EVERY row in `input` (the full window —
 * the count-capped 5-row buffer for count-mode variants, or the full 1 s span
 * for time-mode), then the matrix is fit to `config.windowSize`: edge-padded if
 * shorter, evenly sub-sampled (np.linspace, matching the training
 * `create_sequences`) if longer.
 */
export function engineerWindow(input: ObservationRow[], config: GatModelConfig): EngineeredWindow {
  const cols = config.norm.feature_cols;
  const clip = config.clipRssiDistance;
  const target = config.windowSize;

  // Sort by capturedAt ascending (matches df.sort_values('capturedAt')).
  const rows = [...input].sort((a, b) => a.capturedAt - b.capturedAt);
  const n = rows.length;

  const uniqueBeacons = new Set(rows.map((r) => r.beaconId)).size;

  if (n === 0) {
    return {
      matrix: [],
      beaconIds: [],
      nReal: 0,
      uniqueBeacons: 0,
      uniqueBeaconsEmitted: 0,
      featureCols: cols,
    };
  }

  // Floor for beacon_floor_match: use an explicit override if present, else infer
  // the window floor from its beacons (majority vote) — matches the training
  // RealTimeLocalizer._prepare_window_df behaviour for live (label-less) windows.
  const providedFloor = rows.find((r) => r.floorLevel !== undefined)?.floorLevel;
  const assumedFloor = providedFloor ?? inferFloorFromBeacons(rows.map((r) => r.beaconId));

  // --- window-level aggregates (constant across rows) ---
  const rssis = rows.map((r) => r.rssi);
  const windowRssiMean = mean(rssis);
  const windowRssiStd = sampleStd(rssis);
  const minCapturedAt = rows[0].capturedAt; // sorted ascending -> first is min

  // Variants trained with BEACON_Y_POS empty saw a constant -1 in the three
  // beacon-position columns; feed them -1, not real positions (see model-configs).
  const useYPos = config.useBeaconYPos;
  let weightedBeaconY = -1;
  if (useYPos) {
    let wyNum = 0;
    let wyDen = 0;
    for (const r of rows) {
      const yPos = BEACON_Y_POS[r.beaconId] ?? -1;
      const rssiLin = Math.pow(10, r.rssi / 10);
      wyNum += yPos * rssiLin;
      wyDen += rssiLin;
    }
    weightedBeaconY = wyNum / (wyDen + 1e-6);
  }

  // Train-data median maps (absent -> legacy 0 fallback). Unknown-key fallback
  // is the row's own rssi (diff 0), matching the Python fillna(df.rssi).
  const beaconMedian = config.norm.beacon_median_rssi;
  const floorMedian = config.norm.floor_beacon_median_rssi;

  // rssi_distance per row (clip applied immediately, before downstream use).
  const distOf = rows.map((r) => rssiToDistance(r.rssi, clip));

  // geom_y_estimate (wifi_geom only, but cheap): inverse-distance-weighted beacon
  // position over the FIRST occurrence of each beacon in the window — exact port
  // of the training drop_duplicates('beaconId') + 1/(dist+0.1) weighting.
  let geomYEstimate = 0;
  {
    const seen = new Set<number>();
    let num = 0;
    let den = 0;
    rows.forEach((r, i) => {
      if (seen.has(r.beaconId)) return;
      seen.add(r.beaconId);
      const yb = BEACON_Y_POS[r.beaconId];
      if (yb === undefined) return;
      const w = 1 / (distOf[i] + 0.1);
      num += yb * w;
      den += w;
    });
    geomYEstimate = den > 0 ? num / den : 0;
  }

  // --- timestamp-group features ---
  const groups = new Map<number, number[]>();
  rows.forEach((r, i) => {
    const arr = groups.get(r.capturedAt);
    if (arr) arr.push(i);
    else groups.set(r.capturedAt, [i]);
  });

  const rankOf = new Array<number>(n);
  const minDistOf = new Array<number>(n);
  const dominantOf = new Array<number>(n);
  const diffToMaxOf = new Array<number>(n);
  const diffTo2ndOf = new Array<number>(n);
  const strongestYOf = new Array<number>(n);

  for (const idxs of groups.values()) {
    const groupRssis = idxs.map((i) => rows[i].rssi);
    const maxR = Math.max(...groupRssis);

    // dense rank, descending (highest rssi -> rank 1; ties share a rank).
    const distinctDesc = Array.from(new Set(groupRssis)).sort((a, b) => b - a);
    const rankMap = new Map<number, number>();
    distinctDesc.forEach((v, k) => rankMap.set(v, k + 1));

    // second-highest rssi by row (sorted desc, index 1); fall back to max when single.
    const sortedDesc = [...groupRssis].sort((a, b) => b - a);
    const secondMax = sortedDesc.length >= 2 ? sortedDesc[1] : maxR;

    // dominant / strongest = first occurrence of the max rssi (pandas idxmax).
    let domIdx = idxs[0];
    for (const i of idxs) if (rows[i].rssi > rows[domIdx].rssi) domIdx = i;
    const dominantBeacon = rows[domIdx].beaconId;
    const strongestY = BEACON_Y_POS[dominantBeacon] ?? -1;

    let minDist = Infinity;
    for (const i of idxs) minDist = Math.min(minDist, distOf[i]);

    for (const i of idxs) {
      rankOf[i] = rankMap.get(rows[i].rssi) ?? 1;
      minDistOf[i] = minDist;
      dominantOf[i] = dominantBeacon;
      diffToMaxOf[i] = rows[i].rssi - maxR;
      diffTo2ndOf[i] = rows[i].rssi - secondMax;
      strongestYOf[i] = strongestY;
    }
  }

  // --- per-row feature dicts ---
  const featureRows: FeatureRow[] = rows.map((r, i) => {
    const yPos = useYPos ? (BEACON_Y_POS[r.beaconId] ?? -1) : -1;
    const beaconFloor = BEACON_FLOOR[r.beaconId] ?? 0;
    const onFloor = beaconFloor === assumedFloor ? 1 : 0;
    const dist = distOf[i];
    const fr: FeatureRow = {
      beaconId: r.beaconId, // col 0 — scaled like every column (identity for variants whose stats are 0/1)
      rssi: r.rssi,
      rel_time: (r.capturedAt - minCapturedAt) / 1000,
      gyroX: r.imu.gyroX,
      gyroY: r.imu.gyroY,
      gyroZ: r.imu.gyroZ,
      accelX: r.imu.accelX,
      accelY: r.imu.accelY,
      accelZ: r.imu.accelZ,
      userAccelX: r.imu.userAccelX,
      userAccelY: r.imu.userAccelY,
      userAccelZ: r.imu.userAccelZ,
      magX: r.imu.magX,
      magY: r.imu.magY,
      magZ: r.imu.magZ,
      pitch: r.imu.pitch,
      roll: r.imu.roll,
      yaw: r.imu.yaw,
      rssi_norm: (r.rssi + 100) / 60,
      rssi_inv: -r.rssi,
      rssi_distance: dist,
      beacon_floor_match: onFloor,
      window_progress: i / Math.max(n - 1, 1),
      rssi_diff_from_beacon_median: beaconMedian
        ? r.rssi - (beaconMedian[String(r.beaconId)] ?? r.rssi)
        : 0,
      beacon_signal_rank: rankOf[i],
      window_rssi_mean: windowRssiMean,
      window_rssi_std: windowRssiStd,
      min_beacon_distance: minDistOf[i],
      beacon_weight: 1 / (dist + 0.1),
      rssi_vs_floor_median: floorMedian
        ? r.rssi - (floorMedian[`${r.beaconId}:${assumedFloor}`] ?? r.rssi)
        : 0,
      beacon_on_this_floor: onFloor,
      dominant_beacon_id: dominantOf[i],
      rssi_diff_to_max: diffToMaxOf[i],
      rssi_diff_to_2nd_max: diffTo2ndOf[i],
      beacon_count_in_window: n,
      motion_magnitude: Math.sqrt(
        r.imu.accelX * r.imu.accelX + r.imu.accelY * r.imu.accelY + r.imu.accelZ * r.imu.accelZ,
      ),
      motion_yaw_rate: Math.abs(r.imu.gyroZ),
      beacon_y_pos: yPos,
      // wifi_geom columns (only projected by that variant's feature_cols):
      beacon_y_pos_norm:
        BEACON_Y_POS[r.beaconId] !== undefined
          ? (BEACON_Y_POS[r.beaconId] - BEACON_Y_MEAN) / BEACON_Y_STD
          : 0,
      geom_y_estimate: geomYEstimate,
      unique_beacon_count: uniqueBeacons,
      weighted_beacon_y: weightedBeaconY,
      strongest_beacon_y: useYPos ? strongestYOf[i] : -1,
    };
    applyWifiBlock(fr, r.wifiRssi, config.wifiKind, config, assumedFloor);
    return fr;
  });

  // --- project onto feature_cols ---
  const fullMatrix: number[][] = featureRows.map((fr) =>
    cols.map((c) => {
      const v = fr[c];
      return Number.isFinite(v) ? v : 0;
    }),
  );
  const fullBeaconIds = rows.map((r) => r.beaconId);

  // --- fit to the model's window size ---
  // time mode : pad-edge if short, evenly sub-sample if long (np.linspace,
  //             matching the training create_sequences).
  // count mode: the model gets the LAST `target` consecutive rows — training cut
  //             consecutive 5-row slices from each chunk, never sub-sampled —
  //             while the aggregates above were computed over the whole buffer.
  let matrix: number[][];
  let beaconIds: number[];
  if (n > target) {
    if (config.windowMode === "count") {
      matrix = fullMatrix.slice(n - target);
      beaconIds = fullBeaconIds.slice(n - target);
    } else {
      matrix = [];
      beaconIds = [];
      for (let k = 0; k < target; k++) {
        const idx = Math.trunc((k * (n - 1)) / (target - 1));
        matrix.push(fullMatrix[idx]);
        beaconIds.push(fullBeaconIds[idx]);
      }
    }
  } else {
    matrix = fullMatrix;
    beaconIds = fullBeaconIds;
    while (matrix.length < target) {
      matrix.push([...matrix[matrix.length - 1]]);
      beaconIds.push(beaconIds[beaconIds.length - 1]);
    }
  }

  return {
    matrix,
    beaconIds,
    nReal: n,
    uniqueBeacons,
    uniqueBeaconsEmitted: new Set(beaconIds).size,
    featureCols: cols,
  };
}
