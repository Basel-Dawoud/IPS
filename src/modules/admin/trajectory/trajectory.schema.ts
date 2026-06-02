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
});

export const trajectoryCheckpointSchema = z.object({
  seq: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
  tMs: z.number(),
  capturedAt: z.string().datetime(),
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
});

export const trajectoryBleReadingSchema = z.object({
  capturedAt: z.string().datetime(),
  tMs: z.number().optional(),
  beaconUid: z.string().min(1),
  rssi: z.number().int(),
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
  steps: z.array(trajectoryStepEventSchema),
  imu: z.array(trajectoryImuSampleSchema),
  ble: z.array(trajectoryBleReadingSchema),
  wifi: z.array(trajectoryWifiReadingSchema).optional(),
  checkpoints: z.array(trajectoryCheckpointSchema).optional(),
});

export const uploadWalksSchema = z.object({
  params: z.object({
    id: z.string().min(1), // session ID
  }),
  body: z.object({
    deviceModel: z.string().optional(),
    walks: z.array(trajectoryWalkSchema).min(1),
  }),
});

export const getTrajectorySessionsSchema = z.object({
  query: z.object({
    buildingId: z.string().optional(),
    floorLevel: z.coerce.number().int().optional(),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "ARCHIVED"]).optional(),
  }),
});
