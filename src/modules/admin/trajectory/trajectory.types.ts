export interface CreateTrajectorySessionInput {
  buildingId: string;
  floorLevel: number;
  name?: string;
  deviceModel?: string;
  collectorId?: string;
  notes?: string;
  // B4 environment versioning + conditions
  buildingVersion?: number;
  beaconLayoutVersion?: number;
  timeOfDay?: string;
  crowdLevel?: string;
  // B5 carry mode + device pose (session-level defaults)
  carryMode?: string;
  phoneAttitude?: string;
}

export interface UpdateTrajectorySessionInput {
  name?: string;
  notes?: string;
  status?: "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";
}

export interface TrajectoryStepEventInput {
  stepIndex: number;
  capturedAt: string; // ISO 8601 — converted to Date in service
  tMs?: number; // monotonic ms since walk start (B1)
  headingRad: number;
}

export interface TrajectoryCheckpointInput {
  seq: number;
  x: number;
  y: number;
  tMs: number;
  capturedAt: string;
}

/**
 * A stationary pause marked mid-walk (Pause → Resume). Freezes ONLY the
 * ground-truth label across [pauseTMs, resumeTMs] (sensors keep recording).
 * `resumeTMs` omitted ⇒ the walk ended while still paused; the server closes
 * the interval at the walk's endedAt.
 */
export interface PauseMarker {
  seq: number;
  pauseTMs: number;
  resumeTMs?: number;
}

export interface TrajectoryImuSampleInput {
  capturedAt: string;
  tMs?: number; // monotonic ms since walk start (B1)
  gyroX?: number;
  gyroY?: number;
  gyroZ?: number;
  accelX?: number;
  accelY?: number;
  accelZ?: number;
  userAccelX?: number;
  userAccelY?: number;
  userAccelZ?: number;
  magX?: number;
  magY?: number;
  magZ?: number;
  pitch?: number;
  roll?: number;
  yaw?: number;
  pressure?: number;
  relativeAltitude?: number;
  // On-device gait-detector state at this sample (optional; legacy clients omit).
  vertAccel?: number;
  gaitVerticality?: number;
  gaitEnergy?: number;
  gaitIsWalking?: boolean;
  gaitAmplitude?: number;
}

export interface TrajectoryBleReadingInput {
  capturedAt: string;
  tMs?: number; // monotonic ms since walk start (B1)
  beaconUid: string;
  rssi: number;
}

export interface TrajectoryWifiReadingInput {
  capturedAt: string;
  tMs?: number; // monotonic ms since walk start (B1)
  bssid: string;
  ssid?: string;
  rssi: number;
  frequencyMhz?: number;
}

export interface TrajectoryWalkInput {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startedAt: string;
  endedAt: string;
  totalSteps: number;
  // B6 idempotency: device-generated UUID per walk (retried uploads dedupe).
  clientId?: string;
  // B1 replay clock anchor: Date.now() at walk start; absolute = clockEpochMs + tMs.
  clockEpochMs?: number;
  // B5 sensor metadata
  imuRateHz?: number;
  magCalibrated?: boolean;
  steps: TrajectoryStepEventInput[];
  imu: TrajectoryImuSampleInput[];
  ble: TrajectoryBleReadingInput[];
  wifi?: TrajectoryWifiReadingInput[];
  // B2 checkpoint waypoints → piecewise-linear ground truth
  checkpoints?: TrajectoryCheckpointInput[];
  // Stop/pause markers → hold ground-truth label across each [pauseTMs, resumeTMs].
  pauses?: PauseMarker[];
}

export interface UploadWalksInput {
  sessionId: string;
  deviceModel?: string;
  walks: TrajectoryWalkInput[];
}

export interface UploadWalksResult {
  walksCreated: number;
  walksSkipped: number; // B6 — duplicate clientId, already persisted
  stepsCreated: number;
  imuSamplesCreated: number;
  bleReadingsCreated: number;
  /** Readings dropped because their beaconUid isn't registered to the session's building. */
  bleReadingsDroppedUnknownBeacon: number;
  wifiReadingsCreated: number;
  checkpointsCreated: number;
  pausesCreated: number;
}

export interface TrajectorySessionWithStats {
  id: string;
  buildingId: string;
  floorLevel: number;
  name: string | null;
  deviceModel: string | null;
  notes: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  walkCount: number;
  totalSteps: number;
}
