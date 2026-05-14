import prisma from "../../../lib/prisma";
import {
  PositioningInput,
  PositionResult,
  PositioningMethod,
  getBeaconUid,
} from "./positioning.types";
import {
  calculateDistance,
  trilaterate,
  BeaconSignal,
} from "../../../utils/trilateration";
import {
  weightedKNN,
  weightedProbabilistic,
  FingerprintVector,
  estimateAccuracy,
} from "../../../utils/fingerprint-matching";

/**
 * Main positioning function - supports multiple methods
 */
export const calculatePosition = async (
  data: PositioningInput
): Promise<PositionResult> => {
  const method = data.method || "auto";

  const beaconUids = data.beacons.map((b) => getBeaconUid(b));

  const beaconsFound = await prisma.bleBeacon.findMany({
    where: {
      beaconUid: { in: beaconUids },
    },
    include: {
      building: {
        include: {
          envModels: true,
        },
      },
    },
  });

  if (beaconsFound.length === 0) {
    throw new Error("No known beacons found in scan");
  }

  const buildingId = data.buildingId || beaconsFound[0].buildingId;

  let effectiveMethod = method;

  if (method === "auto") {
    const fingerprintCount = await prisma.aggregatedFingerprint.count({
      where: { buildingId },
    });

    if (fingerprintCount >= 3) {
      effectiveMethod = "probabilistic";
    } else {
      effectiveMethod = "trilateration";
    }
  }

  if (effectiveMethod === "fingerprint") {
    return calculatePositionByFingerprint(data, buildingId, beaconsFound, "deterministic");
  } else if (effectiveMethod === "probabilistic") {
    return calculatePositionByFingerprint(data, buildingId, beaconsFound, "probabilistic");
  } else if (effectiveMethod === "hybrid") {
    return calculatePositionHybrid(data, buildingId, beaconsFound);
  } else {
    return calculatePositionByTrilateration(data, buildingId, beaconsFound);
  }
};

/**
 * Trilateration-based positioning (existing approach)
 */
async function calculatePositionByTrilateration(
  data: PositioningInput,
  buildingId: string,
  beaconsFound: any[]
): Promise<PositionResult> {
  if (beaconsFound.length < 3) {
    throw new Error("Not enough known beacons found to calculate position (need 3+)");
  }

  const signals: BeaconSignal[] = [];
  const floorCounts: Record<number, number> = {};

  for (const dbBeacon of beaconsFound) {
    const inputBeacon = data.beacons.find((b) => getBeaconUid(b) === dbBeacon.beaconUid);
    if (!inputBeacon) continue;

    const envModel =
      dbBeacon.building.envModels.find(
        (m: any) => m.floorLevel === dbBeacon.floorLevel
      ) || dbBeacon.building.envModels.find((m: any) => m.floorLevel === null);

    const n = envModel?.nExponent || 2.0;
    const txPower = dbBeacon.txPowerDbm || -59;

    const distance = calculateDistance(inputBeacon.rssi, txPower, n);

    signals.push({
      x: dbBeacon.x,
      y: dbBeacon.y,
      distance,
    });

    floorCounts[dbBeacon.floorLevel] = (floorCounts[dbBeacon.floorLevel] || 0) + 1;
  }

  let bestFloor = 0;
  let maxCount = 0;
  for (const [floor, count] of Object.entries(floorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      bestFloor = parseInt(floor);
    }
  }

  const position = trilaterate(signals);

  if (!position) {
    throw new Error("Trilateration failed (geometric error)");
  }

  const avgDistance = signals.reduce((s, sig) => s + sig.distance, 0) / signals.length;
  const accuracy = Math.max(2, avgDistance * 0.3);

  return {
    x: position.x,
    y: position.y,
    floorLevel: bestFloor,
    buildingId,
    accuracy,
    method: "trilateration",
    confidence: Math.min(1, signals.length / 5),
  };
}

/**
 * Fingerprint-based positioning. `mode` selects the matching algorithm:
 *  - "deterministic": Weighted kNN over Euclidean RSSI distance.
 *  - "probabilistic": Gaussian-PDF likelihood (Zhao et al. 2018), uses std-devs.
 */
async function calculatePositionByFingerprint(
  data: PositioningInput,
  buildingId: string,
  beaconsFound: any[],
  mode: "deterministic" | "probabilistic" = "deterministic"
): Promise<PositionResult> {
  const aggregatedFingerprints = await prisma.aggregatedFingerprint.findMany({
    where: {
      buildingId,
      ...(data.floorHint !== undefined && { floorLevel: data.floorHint }),
    },
  });

  if (aggregatedFingerprints.length === 0) {
    throw new Error(
      "No fingerprint data available for this building. Please collect fingerprints first."
    );
  }

  const fingerprints: FingerprintVector[] = aggregatedFingerprints.map((af: any) => ({
    gridX: af.gridX,
    gridY: af.gridY,
    floorLevel: af.floorLevel,
    beaconUids: af.beaconUids,
    rssiMeans: af.rssiMeans,
    rssiStdDevs: af.rssiStdDevs,
  }));

  const scanResult = {
    beaconUids: data.beacons.map((b) => getBeaconUid(b)),
    rssis: data.beacons.map((b) => b.rssi),
  };

  const matcher = mode === "probabilistic" ? weightedProbabilistic : weightedKNN;
  const knnResult = matcher(scanResult, fingerprints, 4, data.floorHint);

  if (!knnResult) {
    throw new Error(
      "Could not determine position from fingerprint matching. Try moving to a different location."
    );
  }

  return {
    x: knnResult.x,
    y: knnResult.y,
    floorLevel: knnResult.floorLevel,
    buildingId,
    accuracy: estimateAccuracy(knnResult),
    method: mode === "probabilistic" ? "probabilistic" : "fingerprint",
    confidence: knnResult.confidence,
    inlierRatio: knnResult.inlierRatio,
    reliable: knnResult.reliable,
  };
}

/**
 * Hybrid positioning - combines trilateration and fingerprinting
 */
async function calculatePositionHybrid(
  data: PositioningInput,
  buildingId: string,
  beaconsFound: any[]
): Promise<PositionResult> {
  let trilaterationResult: PositionResult | null = null;
  let fingerprintResult: PositionResult | null = null;

  try {
    trilaterationResult = await calculatePositionByTrilateration(
      data,
      buildingId,
      beaconsFound
    );
  } catch (e) {
    console.warn("Trilateration failed in hybrid mode:", e);
  }

  try {
    fingerprintResult = await calculatePositionByFingerprint(
      data,
      buildingId,
      beaconsFound,
      "probabilistic"
    );
  } catch (e) {
    console.warn("Fingerprinting failed in hybrid mode:", e);
  }

  if (!trilaterationResult && fingerprintResult) {
    return { ...fingerprintResult, method: "hybrid" };
  }
  if (trilaterationResult && !fingerprintResult) {
    return { ...trilaterationResult, method: "hybrid" };
  }
  if (!trilaterationResult && !fingerprintResult) {
    throw new Error("Both positioning methods failed");
  }

  const trilat = trilaterationResult!;
  const finger = fingerprintResult!;

  const totalConfidence = trilat.confidence + finger.confidence;
  if (totalConfidence === 0) {
    return { ...finger, method: "hybrid" };
  }
  const trilatWeight = trilat.confidence / totalConfidence;
  const fingerWeight = finger.confidence / totalConfidence;

  return {
    x: trilat.x * trilatWeight + finger.x * fingerWeight,
    y: trilat.y * trilatWeight + finger.y * fingerWeight,
    floorLevel:
      finger.confidence > trilat.confidence ? finger.floorLevel : trilat.floorLevel,
    buildingId,
    accuracy: trilat.accuracy * trilatWeight + finger.accuracy * fingerWeight,
    method: "hybrid",
    confidence: Math.max(trilat.confidence, finger.confidence),
  };
}

/**
 * Store measurement for analytics
 */
export const storeMeasurement = async (
  input: PositioningInput,
  result: PositionResult
) => {
  return prisma.measurement.create({
    data: {
      buildingId: result.buildingId,
      floorHint: input.floorHint,
      method: result.method,
      beaconUids: input.beacons.map((b) => getBeaconUid(b)),
      rssis: input.beacons.map((b) => b.rssi),
      estX: result.x,
      estY: result.y,
      estFloor: result.floorLevel,
      accuracyM: result.accuracy,
    },
  });
};
