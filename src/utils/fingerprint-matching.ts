/**
 * Fingerprint Matching Utility
 * Implements Weighted K-Nearest Neighbors (KNN) for BLE fingerprint-based positioning
 */

export interface FingerprintVector {
  gridX: number;
  gridY: number;
  floorLevel: number;
  beaconUids: string[];
  rssiMeans: number[];
  rssiStdDevs?: number[];
}

export interface ScanResult {
  beaconUids: string[];
  rssis: number[];
}

export interface KNNResult {
  x: number;
  y: number;
  floorLevel: number;
  confidence: number; // 0-1, higher is better
  matchCount: number; // Number of fingerprints used
  /** Fraction of top-k RPs that lie within `inlierRadiusM` of the weighted estimate. */
  inlierRatio: number;
  /** True when inlierRatio >= 0.5 — top-k cluster is tight enough to trust. */
  reliable: boolean;
}

const RSSI_NOT_DETECTED = -100;

const RSSI_MIN_THRESHOLD = -95;

/**
 * Normalize RSSI value to handle edge cases
 */
function normalizeRssi(rssi: number): number {
  if (rssi === 0 || rssi < RSSI_MIN_THRESHOLD) {
    return RSSI_NOT_DETECTED;
  }
  return rssi;
}

/**
 * Build a unified beacon list from all fingerprints
 * Returns ordered list of all unique beacon UIDs
 */
export function buildUnifiedBeaconList(fingerprints: FingerprintVector[]): string[] {
  const beaconSet = new Set<string>();
  for (const fp of fingerprints) {
    for (const uid of fp.beaconUids) {
      beaconSet.add(uid);
    }
  }
  return Array.from(beaconSet).sort();
}

/**
 * Convert a fingerprint to a fixed-size RSSI vector based on unified beacon list
 * Missing beacons get RSSI_NOT_DETECTED
 */
export function toUnifiedVector(
  beaconUids: string[],
  rssis: number[],
  unifiedBeacons: string[]
): number[] {
  const rssiMap = new Map<string, number>();
  for (let i = 0; i < beaconUids.length; i++) {
    rssiMap.set(beaconUids[i], normalizeRssi(rssis[i]));
  }

  return unifiedBeacons.map((uid) => rssiMap.get(uid) ?? RSSI_NOT_DETECTED);
}

/**
 * Calculate Euclidean distance between two RSSI vectors
 * Lower distance = more similar
 */
export function rssiEuclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error("RSSI vectors must have same length");
  }

  let sumSquares = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sumSquares += diff * diff;
  }

  return Math.sqrt(sumSquares);
}

/**
 * Calculate Manhattan distance between two RSSI vectors (alternative to Euclidean)
 * Sometimes performs better with noisy RSSI data
 */
export function rssiManhattanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error("RSSI vectors must have same length");
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    sum += Math.abs(vectorA[i] - vectorB[i]);
  }

  return sum;
}

interface FingerprintWithDistance {
  fingerprint: FingerprintVector;
  distance: number;
}

/**
 * Weighted K-Nearest Neighbors algorithm for position estimation
 *
 * @param scan - Current BLE scan result from device
 * @param fingerprints - Radio map (aggregated fingerprints from database)
 * @param k - Number of nearest neighbors to consider (default: 4)
 * @param floorHint - Optional floor hint to filter fingerprints
 * @returns Estimated position with confidence score
 */
export function weightedKNN(
  scan: ScanResult,
  fingerprints: FingerprintVector[],
  k: number = 4,
  floorHint?: number
): KNNResult | null {
  if (fingerprints.length === 0) {
    return null;
  }

  let candidateFingerprints = fingerprints;
  if (floorHint !== undefined) {
    candidateFingerprints = fingerprints.filter((fp) => fp.floorLevel === floorHint);
    if (candidateFingerprints.length === 0) {
      candidateFingerprints = fingerprints;
    }
  }

  const unifiedBeacons = buildUnifiedBeaconList(candidateFingerprints);

  const scanVector = toUnifiedVector(scan.beaconUids, scan.rssis, unifiedBeacons);

  const distances: FingerprintWithDistance[] = candidateFingerprints.map((fp) => {
    const fpVector = toUnifiedVector(fp.beaconUids, fp.rssiMeans, unifiedBeacons);
    const distance = rssiEuclideanDistance(scanVector, fpVector);
    return { fingerprint: fp, distance };
  });

  distances.sort((a, b) => a.distance - b.distance);

  const kNearest = distances.slice(0, Math.min(k, distances.length));

  if (kNearest.length === 0) {
    return null;
  }

  const EPSILON = 0.001;
  let totalWeight = 0;
  const weightedNeighbors = kNearest.map(({ fingerprint, distance }) => {
    const weight = 1 / (distance + EPSILON);
    totalWeight += weight;
    return { fingerprint, weight };
  });

  let weightedX = 0;
  let weightedY = 0;
  const floorVotes: Record<number, number> = {};

  for (const { fingerprint, weight } of weightedNeighbors) {
    const normalizedWeight = weight / totalWeight;
    weightedX += fingerprint.gridX * normalizedWeight;
    weightedY += fingerprint.gridY * normalizedWeight;

    floorVotes[fingerprint.floorLevel] =
      (floorVotes[fingerprint.floorLevel] || 0) + normalizedWeight;
  }

  let bestFloor = kNearest[0].fingerprint.floorLevel;
  let maxFloorVote = 0;
  for (const [floor, vote] of Object.entries(floorVotes)) {
    if (vote > maxFloorVote) {
      maxFloorVote = vote;
      bestFloor = parseInt(floor);
    }
  }


  const avgDistance = kNearest.reduce((s, n) => s + n.distance, 0) / kNearest.length;

  const distanceConfidence = 1 / (1 + avgDistance / 50);

  const floorConfidence = maxFloorVote;

  const confidence = distanceConfidence * 0.7 + floorConfidence * 0.3;

  const { inlierRatio, reliable } = computeReliability(
    kNearest.map((n) => n.fingerprint),
    weightedX,
    weightedY,
    bestFloor
  );

  return {
    x: weightedX,
    y: weightedY,
    floorLevel: bestFloor,
    confidence: Math.min(1, Math.max(0, confidence)),
    matchCount: kNearest.length,
    inlierRatio,
    reliable,
  };
}

/**
 * Probabilistic fingerprinting (Zhao et al. 2018 / Bahl-style).
 *
 * Each stored fingerprint is treated as a Gaussian distribution per beacon
 * (mean = rssiMean, variance = rssiStdDev²). For a live scan we compute the
 * joint likelihood that each RP could have produced these readings, assuming
 * the beacons are conditionally independent:
 *
 *     score(RP) = ∏_m  N(rss_m | μ_m,RP, σ²_m,RP)
 *
 * Top-K RPs are kept, normalized into weights, and a weighted average gives
 * the position. Falls back to weightedKNN if std-dev data is missing.
 */
export function weightedProbabilistic(
  scan: ScanResult,
  fingerprints: FingerprintVector[],
  k: number = 4,
  floorHint?: number
): KNNResult | null {
  if (fingerprints.length === 0) return null;

  const haveStdDev = fingerprints.every(
    (fp) => fp.rssiStdDevs && fp.rssiStdDevs.length === fp.beaconUids.length
  );
  if (!haveStdDev) {
    return weightedKNN(scan, fingerprints, k, floorHint);
  }

  let candidates = fingerprints;
  if (floorHint !== undefined) {
    const sameFloor = fingerprints.filter((fp) => fp.floorLevel === floorHint);
    if (sameFloor.length > 0) candidates = sameFloor;
  }

  const liveRssi = new Map<string, number>();
  for (let i = 0; i < scan.beaconUids.length; i++) {
    liveRssi.set(scan.beaconUids[i], normalizeRssi(scan.rssis[i]));
  }

  const SIGMA_FLOOR = 2.0;

  type Scored = { fingerprint: FingerprintVector; logLik: number };
  const scored: Scored[] = [];

  for (const fp of candidates) {
    let logLik = 0;
    let usedBeacons = 0;

    for (let i = 0; i < fp.beaconUids.length; i++) {
      const uid = fp.beaconUids[i];
      const mu = fp.rssiMeans[i];
      const sigma = Math.max(fp.rssiStdDevs![i], SIGMA_FLOOR);

      const observed = liveRssi.get(uid);
      if (observed === undefined) continue; // Beacon not seen this scan — skip.

      const diff = observed - mu;
      logLik += -0.5 * Math.log(2 * Math.PI * sigma * sigma) -
        (diff * diff) / (2 * sigma * sigma);
      usedBeacons += 1;
    }

    if (usedBeacons === 0) continue;

    scored.push({ fingerprint: fp, logLik });
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.logLik - a.logLik);
  const topK = scored.slice(0, Math.min(k, scored.length));

  const maxLog = topK[0].logLik;
  let totalWeight = 0;
  const weighted = topK.map(({ fingerprint, logLik }) => {
    const w = Math.exp(logLik - maxLog);
    totalWeight += w;
    return { fingerprint, weight: w };
  });

  let weightedX = 0;
  let weightedY = 0;
  const floorVotes: Record<number, number> = {};

  for (const { fingerprint, weight } of weighted) {
    const w = weight / totalWeight;
    weightedX += fingerprint.gridX * w;
    weightedY += fingerprint.gridY * w;
    floorVotes[fingerprint.floorLevel] =
      (floorVotes[fingerprint.floorLevel] || 0) + w;
  }

  let bestFloor = topK[0].fingerprint.floorLevel;
  let maxFloorVote = 0;
  for (const [floor, vote] of Object.entries(floorVotes)) {
    if (vote > maxFloorVote) {
      maxFloorVote = vote;
      bestFloor = parseInt(floor);
    }
  }

  const topMass = weighted[0].weight / totalWeight;
  const confidence = 0.5 * topMass + 0.5 * maxFloorVote;

  const { inlierRatio, reliable } = computeReliability(
    topK.map((s) => s.fingerprint),
    weightedX,
    weightedY,
    bestFloor
  );

  return {
    x: weightedX,
    y: weightedY,
    floorLevel: bestFloor,
    confidence: Math.min(1, Math.max(0, confidence)),
    matchCount: topK.length,
    inlierRatio,
    reliable,
  };
}

/** Spread of the matched RPs around the chosen point. */
function computeReliability(
  rps: FingerprintVector[],
  estX: number,
  estY: number,
  floor: number,
  inlierRadiusM: number = 2.0
): { inlierRatio: number; reliable: boolean } {
  if (rps.length === 0) return { inlierRatio: 0, reliable: false };

  let inliers = 0;
  for (const rp of rps) {
    if (rp.floorLevel !== floor) continue;
    const dx = rp.gridX - estX;
    const dy = rp.gridY - estY;
    if (Math.sqrt(dx * dx + dy * dy) <= inlierRadiusM) inliers += 1;
  }

  const ratio = inliers / rps.length;
  return { inlierRatio: ratio, reliable: ratio >= 0.5 };
}

/**
 * Filter outlier fingerprints based on RSSI standard deviation
 * Removes fingerprints with high variance (unreliable readings)
 */
export function filterOutlierFingerprints(
  fingerprints: FingerprintVector[],
  maxStdDev: number = 8
): FingerprintVector[] {
  return fingerprints;
}

/**
 * Estimate accuracy in meters based on KNN result
 * Uses a heuristic based on confidence and grid spacing
 */
export function estimateAccuracy(result: KNNResult, gridSpacing: number = 1.0): number {
  const baseAccuracy = gridSpacing;
  const confidenceFactor = 1 + (1 - result.confidence) * 2;

  return baseAccuracy * confidenceFactor;
}
