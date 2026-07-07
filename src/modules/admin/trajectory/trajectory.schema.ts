import { z } from "zod";

export const createTrajectorySessionSchema = z.object({
  body: z.object({
    buildingId: z.string().min(1, "Building ID is required"),
    floorLevel: z.number().int(),
    name: z.string().optional(),
    deviceModel: z.string().optional(),
    collectorId: z.string().optional(),
    notes: z.string().optional(),
    // B4 environment versioning + conditions
    buildingVersion: z.number().int().optional(),
    beaconLayoutVersion: z.number().int().optional(),
    timeOfDay: z.string().optional(),
    crowdLevel: z.string().optional(),
    // B5 carry mode + device pose
    carryMode: z.string().optional(),
    phoneAttitude: z.string().optional(),
  }),
});

export const updateTrajectorySessionSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "ARCHIVED"]).optional(),
  }),
});

export const trajectoryStepEventSchema = z.object({
  stepIndex: z.number().int().min(0),
  capturedAt: z.string().datetime(),
  tMs: z.number().optional(),
  headingRad: z.number(),
  // Absolute compass bearing (deg, 0 = N, 90 = E); optional, legacy clients omit.
  compassDeg: z.number().optional(),
});

export const trajectoryCheckpointSchema = z.object({
  seq: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
  tMs: z.number(),
  capturedAt: z.string().datetime(),
});

/**
 * A stationary pause marked mid-walk. `resumeTMs` omitted ⇒ the walk ended
 * while still paused (server closes the interval at endedAt).
 */
export const trajectoryPauseSchema = z.object({
  seq: z.number().int().min(0),
  pauseTMs: z.number(),
  resumeTMs: z.number().optional(),
});

export const trajectoryImuSampleSchema = z.object({
  capturedAt: z.string().datetime(),
  tMs: z.number().optional(),
  gyroX: z.number().optional(),
  gyroY: z.number().optional(),
  gyroZ: z.number().optional(),
  accelX: z.number().optional(),
  accelY: z.number().optional(),
  accelZ: z.number().optional(),
  userAccelX: z.number().optional(),
  userAccelY: z.number().optional(),
  userAccelZ: z.number().optional(),
  magX: z.number().optional(),
  magY: z.number().optional(),
  magZ: z.number().optional(),
  pitch: z.number().optional(),
  roll: z.number().optional(),
  yaw: z.number().optional(),
  pressure: z.number().optional(),
  relativeAltitude: z.number().optional(),
  // On-device gait-detector state (optional; legacy clients omit).
  vertAccel: z.number().optional(),
  gaitVerticality: z.number().optional(),
  gaitEnergy: z.number().optional(),
  gaitIsWalking: z.boolean().optional(),
  gaitAmplitude: z.number().optional(),
  // Absolute OS-fused compass (optional; legacy clients omit). The absolute
  // reference the relative/drifting DeviceMotion yaw lacks.
  compassDeg: z.number().optional(),
  compassAccuracyDeg: z.number().optional(),
});

export const trajectoryBleReadingSchema = z.object({
  capturedAt: z.string().datetime(),
  tMs: z.number().optional(),
  beaconUid: z.string().min(1).max(128),
  // Physically plausible BLE RSSI band — rejects garbage like 0 or 12345.
  rssi: z.number().int().min(-127).max(0),
});

export const trajectoryWifiReadingSchema = z.object({
  capturedAt: z.string().datetime(),
  tMs: z.number().optional(),
  bssid: z.string().min(1),
  ssid: z.string().optional(),
  rssi: z.number().int(),
  frequencyMhz: z.number().int().optional(),
});

export const trajectoryWalkSchema = z.object({
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  totalSteps: z.number().int().min(0),
  clientId: z.string().optional(),
  clockEpochMs: z.number().optional(),
  imuRateHz: z.number().int().optional(),
  magCalibrated: z.boolean().optional(),
  // Per-walk caps: generous for real walks (IMU cap ≈ 50 min @ 50 Hz) but
  // bounded so a single request can't exhaust server memory.
  steps: z.array(trajectoryStepEventSchema).max(20_000),
  imu: z.array(trajectoryImuSampleSchema).max(150_000),
  ble: z.array(trajectoryBleReadingSchema).max(100_000),
  wifi: z.array(trajectoryWifiReadingSchema).max(5_000).optional(),
  checkpoints: z.array(trajectoryCheckpointSchema).max(500).optional(),
  pauses: z.array(trajectoryPauseSchema).max(500).optional(),
});

export const uploadWalksSchema = z.object({
  params: z.object({
    id: z.string().min(1), // session ID
  }),
  body: z.object({
    deviceModel: z.string().optional(),
    walks: z.array(trajectoryWalkSchema).min(1).max(50),
  }),
});

export const getTrajectorySessionsSchema = z.object({
  query: z.object({
    buildingId: z.string().optional(),
    floorLevel: z.coerce.number().int().optional(),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "ARCHIVED"]).optional(),
  }),
});
