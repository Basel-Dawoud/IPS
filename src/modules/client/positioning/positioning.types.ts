/**
 * iBeacon format reading (legacy support)
 */
export interface IBeaconReading {
  uuid: string;
  major: number;
  minor: number;
  rssi: number;
}

/**
 * Flexible beacon format - for ESP32, phones, any BLE device
 * Uses any unique identifier (MAC address, custom name, etc.)
 */
export interface FlexibleBeaconReading {
  beaconId: string; // MAC address, custom ID, or any unique identifier
  rssi: number;
}

/**
 * Combined type - accepts either format
 */
export type BeaconReading = IBeaconReading | FlexibleBeaconReading;

export type PositioningMethod =
  | "trilateration"
  | "fingerprint"
  | "probabilistic"
  | "hybrid"
  | "auto";

export interface PositioningInput {
  beacons: BeaconReading[];
  buildingId?: string; // Optional: if not provided, inferred from beacons
  floorHint?: number; // Optional: helps with floor detection
  method?: PositioningMethod; // Default: "auto"
}

export interface PositionResult {
  x: number;
  y: number;
  floorLevel: number;
  buildingId: string;
  accuracy: number; // Estimated accuracy in meters
  method: PositioningMethod; // Which method was actually used
  confidence: number; // 0-1, higher is better
  /** Fraction of top-k RPs clustering near the estimate. Undefined for trilateration. */
  inlierRatio?: number;
  /** True when the top-k RPs are tightly clustered (inlierRatio >= 0.5). */
  reliable?: boolean;
}

/**
 * Helper to check if reading is iBeacon format
 */
export function isIBeaconReading(reading: BeaconReading): reading is IBeaconReading {
  return "uuid" in reading && "major" in reading && "minor" in reading;
}

/**
 * Helper to check if reading is flexible format
 */
export function isFlexibleReading(
  reading: BeaconReading
): reading is FlexibleBeaconReading {
  return "beaconId" in reading;
}

/**
 * Convert any reading to beacon UID string
 */
export function getBeaconUid(reading: BeaconReading): string {
  if (isFlexibleReading(reading)) {
    return reading.beaconId;
  } else {
    return `${reading.uuid}:${reading.major}:${reading.minor}`;
  }
}
