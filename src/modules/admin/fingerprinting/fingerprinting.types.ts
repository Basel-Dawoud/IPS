
export interface CreateSessionInput {
  buildingId: string;
  floorLevel: number;
  name?: string;
  deviceModel?: string;
  gridSpacing?: number;
  pointDurationMs?: number;
  collectorId?: string;
}

export interface UpdateSessionInput {
  name?: string;
  status?: "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";
  completedAt?: Date;
}

export interface RawRssiReading {
  beaconUid: string;
  rssi: number;
  capturedAt: string; // ISO 8601 string from client — converted to Date when stored
  // Gyroscope
  gyroX?: number;
  gyroY?: number;
  gyroZ?: number;
  // Raw accelerometer (g)
  accelX?: number;
  accelY?: number;
  accelZ?: number;
  // Gravity-removed acceleration (m/s²)
  userAccelX?: number;
  userAccelY?: number;
  userAccelZ?: number;
  // Magnetometer (µT)
  magX?: number;
  magY?: number;
  magZ?: number;
  // Attitude (rad)
  pitch?: number;
  roll?: number;
  yaw?: number;
  // Environmental
  pressure?: number;
  relativeAltitude?: number;
}

export interface WifiReading {
  bssid: string;
  ssid?: string;
  rssi: number;
  frequencyMhz?: number;
  capturedAt: string;
}

export interface FingerprintSample {
  beaconUids: string[];
  rssis: number[];
  durationMs: number;
  rawReadings: RawRssiReading[];
  wifiReadings?: WifiReading[];
}

export interface CollectionPoint {
  x: number;
  y: number;
  samples: FingerprintSample[];
}

export interface BatchFingerprintInput {
  sessionId: string;
  deviceModel?: string;
  points: CollectionPoint[];
}

export interface SessionWithStats {
  id: string;
  buildingId: string;
  floorLevel: number;
  name: string | null;
  deviceModel: string | null;
  gridSpacing: number;
  pointDurationMs: number | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  fingerprintCount: number;
  uniquePointCount: number;
}

export interface RadioMapPoint {
  gridX: number;
  gridY: number;
  floorLevel: number;
  beaconUids: string[];
  rssiMeans: number[];
  sampleCount: number;
}

export interface RadioMap {
  buildingId: string;
  floorLevel?: number;
  points: RadioMapPoint[];
  totalPoints: number;
  generatedAt: Date;
}

export interface AggregationResult {
  pointsProcessed: number;
  pointsCreated: number;
  pointsUpdated: number;
}
