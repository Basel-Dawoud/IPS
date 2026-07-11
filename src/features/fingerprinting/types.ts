export type SessionStatus = "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";

export interface FingerprintSession {
  id: string;
  buildingId: string;
  floorLevel: number;
  name: string | null;
  deviceModel: string | null;
  collectorId?: string | null;
  gridSpacing: number;
  pointDurationMs: number | null;
  status: SessionStatus;
  startedAt: string;
  completedAt: string | null;
  // Stats included by `getSessionsByBuilding` (mapped output)
  fingerprintCount?: number;
  uniquePointCount?: number;
}

export interface Fingerprint {
  id: string;
  buildingId: string;
  sessionId: string | null;
  floorLevel: number;
  x: number;
  y: number;
  beaconUids: string[];
  rssis: number[];
  durationMs: number | null;
  deviceModel: string | null;
  layoutTag: string | null;
  sampleIndex: number | null;
  createdAt: string;
}

export interface SessionAnalyticsSample {
  id: string;
  sampleIndex: number | null;
  createdAt: string;
}

export interface SessionAnalyticsPoint {
  x: number;
  y: number;
  sampleCount: number;
  rawReadingCount: number;
  beaconCount: number;
  samples: SessionAnalyticsSample[];
}

export interface SessionAnalyticsBeacon {
  beaconUid: string;
  pointsSeen: number;
  sampleCount: number;
  meanRssi: number;
  minRssi: number;
  maxRssi: number;
}

export interface SessionAnalytics {
  sessionId: string;
  name: string | null;
  status: SessionStatus;
  floorLevel: number;
  startedAt: string;
  completedAt: string | null;
  totals: {
    uniquePoints: number;
    totalSamples: number;
    totalRawReadings: number;
    uniqueBeacons: number;
  };
  points: SessionAnalyticsPoint[];
  beacons: SessionAnalyticsBeacon[];
}
