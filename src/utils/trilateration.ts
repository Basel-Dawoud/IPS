export interface Point {
  x: number;
  y: number;
}

export interface BeaconSignal {
  x: number;
  y: number;
  distance: number;
}

/**
 * Converts RSSI to Distance using Log-Distance Path Loss Model
 * @param rssi Received Signal Strength Indicator
 * @param txPower RSSI at 1 meter (TxPower)
 * @param n Path-loss exponent (default 2.0 for free space, 2.0-4.0 for indoor)
 * @returns Distance in meters
 */
export const calculateDistance = (
  rssi: number,
  txPower: number,
  n: number = 2.0
): number => {
  if (rssi === 0) {
    return -1.0; // Cannot determine distance
  }


  const exponent = (txPower - rssi) / (10 * n);
  return Math.pow(10, exponent);
};

/**
 * Estimates position using Trilateration (Intersection of 3 circles)
 * Uses a simplified geometric approach or centroid of intersection points.
 * For this implementation, we'll use a basic 3-point trilateration.
 */
export const trilaterate = (beacons: BeaconSignal[]): Point | null => {
  if (beacons.length < 3) {
    return null; // Need at least 3 beacons
  }

  const sorted = [...beacons].sort((a, b) => a.distance - b.distance).slice(0, 3);
  const [b1, b2, b3] = sorted;


  const A = 2 * b2.x - 2 * b1.x;
  const B = 2 * b2.y - 2 * b1.y;
  const C =
    Math.pow(b1.distance, 2) -
    Math.pow(b2.distance, 2) -
    Math.pow(b1.x, 2) +
    Math.pow(b2.x, 2) -
    Math.pow(b1.y, 2) +
    Math.pow(b2.y, 2);

  const D = 2 * b3.x - 2 * b2.x;
  const E = 2 * b3.y - 2 * b2.y;
  const F =
    Math.pow(b2.distance, 2) -
    Math.pow(b3.distance, 2) -
    Math.pow(b2.x, 2) +
    Math.pow(b3.x, 2) -
    Math.pow(b2.y, 2) +
    Math.pow(b3.y, 2);

  const denom1 = E * A - B * D;
  const denom2 = B * D - A * E;

  if (Math.abs(denom1) < 1e-10 || Math.abs(denom2) < 1e-10) {
    return null; // Beacons are collinear, trilateration impossible
  }

  const x = (C * E - F * B) / denom1;
  const y = (C * D - A * F) / denom2;

  if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
    return null;
  }

  return { x, y };
};
