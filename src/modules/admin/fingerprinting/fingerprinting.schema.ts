import { z } from "zod";

export const createSessionSchema = z.object({
  body: z.object({
    buildingId: z.string().min(1, "Building ID is required"),
    floorLevel: z.number().int(),
    name: z.string().optional(),
    deviceModel: z.string().optional(),
    gridSpacing: z.number().positive().default(1.0),
    pointDurationMs: z.number().int().min(1000).max(60000).optional(),
    collectorId: z.string().optional(),
  }),
});

export const updateSessionSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().optional(),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "ARCHIVED"]).optional(),
  }),
});

const SCAN_MS_MIN = Number(process.env.FINGERPRINT_SCAN_MS_MIN ?? 1000);
const SCAN_MS_MAX = Number(process.env.FINGERPRINT_SCAN_MS_MAX ?? 30000);

export const rawRssiReadingSchema = z.object({
  beaconUid: z.string().min(1),
  rssi: z.number().int(),
  capturedAt: z.string().datetime(), // ISO 8601 — converted to Date in service
  gyroX: z.number().optional(),
  gyroY: z.number().optional(),
  gyroZ: z.number().optional(),
});

export const fingerprintSampleSchema = z
  .object({
    beaconUids: z.array(z.string()),
    rssis: z.array(z.number().int()),
    durationMs: z.number().int().min(SCAN_MS_MIN).max(SCAN_MS_MAX),
    rawReadings: z.array(rawRssiReadingSchema).min(1),
  })
  .refine((s) => s.beaconUids.length === s.rssis.length, {
    message: "beaconUids and rssis must have the same length",
  });

export const collectionPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  samples: z.array(fingerprintSampleSchema).min(1),
});

export const batchFingerprintSchema = z.object({
  params: z.object({
    id: z.string().min(1), // session ID
  }),
  body: z.object({
    deviceModel: z.string().optional(),
    points: z.array(collectionPointSchema).min(1),
  }),
});

export const getSessionsSchema = z.object({
  params: z.object({
    buildingId: z.string().min(1),
  }),
  query: z.object({
    floorLevel: z.coerce.number().int().optional(),
    status: z.enum(["IN_PROGRESS", "COMPLETED", "ARCHIVED"]).optional(),
  }),
});

export const aggregateSchema = z.object({
  params: z.object({
    id: z.string().min(1), // session ID
  }),
});

export const getRadioMapSchema = z.object({
  params: z.object({
    buildingId: z.string().min(1),
  }),
  query: z.object({
    floorLevel: z.coerce.number().int().optional(),
  }),
});
