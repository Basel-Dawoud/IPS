import prisma from "../../../lib/prisma";
import {
  CreateSessionInput,
  UpdateSessionInput,
  BatchFingerprintInput,
  SessionWithStats,
  RadioMap,
  AggregationResult,
} from "./fingerprinting.types";

/**
 * Create a new fingerprint collection session
 */
export const createSession = async (data: CreateSessionInput) => {
  const building = await prisma.building.findUnique({
    where: { id: data.buildingId },
  });

  if (!building) {
    throw new Error("Building not found");
  }

  return prisma.fingerprintSession.create({
    data: {
      buildingId: data.buildingId,
      floorLevel: data.floorLevel,
      name: data.name,
      deviceModel: data.deviceModel,
      gridSpacing: data.gridSpacing ?? 1.0,
      pointDurationMs: data.pointDurationMs ?? null,
      collectorId: data.collectorId,
      status: "IN_PROGRESS",
    },
  });
};

/**
 * Get all sessions for a building with statistics
 */
export const getSessionsByBuilding = async (
  buildingId: string,
  floorLevel?: number,
  status?: string
): Promise<SessionWithStats[]> => {
  const where: any = { buildingId };
  if (floorLevel !== undefined) {
    where.floorLevel = floorLevel;
  }
  if (status) {
    where.status = status;
  }

  const sessions = await prisma.fingerprintSession.findMany({
    where,
    include: {
      _count: {
        select: { fingerprints: true },
      },
      fingerprints: {
        select: { x: true, y: true },
        distinct: ["x", "y"],
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return sessions.map((s) => ({
    id: s.id,
    buildingId: s.buildingId,
    floorLevel: s.floorLevel,
    name: s.name,
    deviceModel: s.deviceModel,
    gridSpacing: s.gridSpacing,
    pointDurationMs: s.pointDurationMs,
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    fingerprintCount: s._count.fingerprints,
    uniquePointCount: s.fingerprints.length,
  }));
};

/**
 * Get a single session by ID
 */
export const getSessionById = async (id: string) => {
  return prisma.fingerprintSession.findUnique({
    where: { id },
    include: {
      building: true,
      _count: {
        select: { fingerprints: true },
      },
    },
  });
};

/**
 * Update session (name, status)
 */
export const updateSession = async (id: string, data: UpdateSessionInput) => {
  const updateData: any = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
  }

  if (data.status) {
    updateData.status = data.status;
    if (data.status === "COMPLETED") {
      updateData.completedAt = new Date();
    }
  }

  return prisma.fingerprintSession.update({
    where: { id },
    data: updateData,
  });
};

/**
 * Delete a session and all its fingerprints
 */
export const deleteSession = async (id: string) => {
  await prisma.bleFingerprint.deleteMany({
    where: { sessionId: id },
  });

  return prisma.fingerprintSession.delete({
    where: { id },
  });
};

/**
 * Batch upload fingerprints for a session
 * Each point can have multiple samples (e.g., 20-30 readings)
 */
/**
 * Persist a batch of collected points for one session.
 *
 * Per sample: one BleFingerprint row (cleaned IQR-median per beacon) plus
 * one RawRssiReading row per advertisement. Done in a single transaction
 * so a mid-upload failure leaves no partial point.
 *
 * Caller (controller) is responsible for filtering the beacon list to
 * building-registered beacons before invoking this — uploaded payloads
 * may contain neighbouring/foreign beacons.
 */
export const uploadFingerprints = async (data: BatchFingerprintInput) => {
  const session = await prisma.fingerprintSession.findUnique({
    where: { id: data.sessionId },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.status === "ARCHIVED") {
    throw new Error("Cannot add fingerprints to archived session");
  }

  let totalFingerprints = 0;

  await prisma.$transaction(async (tx) => {
    for (const point of data.points) {
      // Each sample = one collection window. windowIndex is the 0-based
      // position within the point; we denormalize it onto every raw
      // reading so ML pipelines can group by window without joining.
      let windowIndex = 0;
      for (const sample of point.samples) {
        if (sample.beaconUids.length !== sample.rssis.length) {
          throw new Error(
            `Mismatched beaconUids and rssis length at point (${point.x}, ${point.y})`
          );
        }

        const fp = await tx.bleFingerprint.create({
          data: {
            buildingId: session.buildingId,
            sessionId: session.id,
            floorLevel: session.floorLevel,
            x: point.x,
            y: point.y,
            beaconUids: sample.beaconUids,
            rssis: sample.rssis,
            durationMs: sample.durationMs,
            deviceModel: data.deviceModel || session.deviceModel,
            sampleIndex: windowIndex,
          },
        });

        if (sample.rawReadings.length > 0) {
          await tx.rawRssiReading.createMany({
            data: sample.rawReadings.map((r) => ({
              fingerprintId: fp.id,
              x: point.x,
              y: point.y,
              windowIndex,
              beaconUid: r.beaconUid,
              rssi: r.rssi,
              capturedAt: new Date(r.capturedAt),
              gyroX: r.gyroX ?? null,
              gyroY: r.gyroY ?? null,
              gyroZ: r.gyroZ ?? null,
            })),
          });
        }

        windowIndex++;
        totalFingerprints++;
      }
    }
  });

  return {
    count: totalFingerprints,
    pointsProcessed: data.points.length,
  };
};

/**
 * Delete all fingerprint samples (and their raw readings via cascade)
 * at a specific (x, y) point within a session.
 * Used for the "Replace duplicate point" workflow.
 *
 * POINT_TOL meters of tolerance — covers float-precision noise but won't
 * accidentally match a neighbouring grid point.
 */
const POINT_TOL = 0.05;

export const deleteSessionPoint = async (
  sessionId: string,
  x: number,
  y: number
): Promise<{ deleted: number }> => {
  const result = await prisma.bleFingerprint.deleteMany({
    where: {
      sessionId,
      x: { gte: x - POINT_TOL, lte: x + POINT_TOL },
      y: { gte: y - POINT_TOL, lte: y + POINT_TOL },
    },
  });
  return { deleted: result.count };
};

/**
 * Delete a single BleFingerprint by ID within a session.
 * Validates it belongs to the session to prevent cross-session deletions.
 * Raw readings cascade-delete automatically.
 */
export const deleteSessionFingerprint = async (
  sessionId: string,
  fingerprintId: string
): Promise<{ deleted: number }> => {
  const fp = await prisma.bleFingerprint.findFirst({
    where: { id: fingerprintId, sessionId },
    select: { id: true },
  });
  if (!fp) {
    throw Object.assign(new Error("Fingerprint not found in this session"), { status: 404 });
  }
  await prisma.bleFingerprint.delete({ where: { id: fingerprintId } });
  return { deleted: 1 };
};

/**
 * Get fingerprints for a session
 */
export const getFingerprintsBySession = async (
  sessionId: string,
  page: number = 1,
  limit: number = 100
) => {
  const offset = (page - 1) * limit;

  const [fingerprints, total] = await Promise.all([
    prisma.bleFingerprint.findMany({
      where: { sessionId },
      skip: offset,
      take: limit,
      orderBy: [{ x: "asc" }, { y: "asc" }, { sampleIndex: "asc" }],
    }),
    prisma.bleFingerprint.count({ where: { sessionId } }),
  ]);

  return {
    fingerprints,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Build the radio map for one session.
 *
 * Groups all BleFingerprint rows in the session by (x, y), then for each
 * group computes per-beacon mean RSSI and population stddev across every
 * sample at that point. Writes one AggregatedFingerprint per grid cell —
 * (buildingId, floorLevel, gridX, gridY) is the unique key, so re-running
 * after adding new points just updates existing rows.
 */
export const aggregateFingerprints = async (
  sessionId: string
): Promise<AggregationResult> => {
  const session = await prisma.fingerprintSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  const fingerprints = await prisma.bleFingerprint.findMany({
    where: { sessionId },
  });

  if (fingerprints.length === 0) {
    throw new Error("No fingerprints found in session");
  }

  const pointGroups = new Map<
    string,
    { x: number; y: number; samples: Array<{ beaconUids: string[]; rssis: number[] }> }
  >();

  for (const fp of fingerprints) {
    const key = `${fp.x},${fp.y}`;
    if (!pointGroups.has(key)) {
      pointGroups.set(key, { x: fp.x, y: fp.y, samples: [] });
    }
    pointGroups.get(key)!.samples.push({
      beaconUids: fp.beaconUids,
      rssis: fp.rssis,
    });
  }

  let pointsCreated = 0;
  let pointsUpdated = 0;

  for (const [_, point] of pointGroups) {
    const beaconRssiMap = new Map<string, number[]>();

    for (const sample of point.samples) {
      for (let i = 0; i < sample.beaconUids.length; i++) {
        const uid = sample.beaconUids[i];
        const rssi = sample.rssis[i];
        if (!beaconRssiMap.has(uid)) {
          beaconRssiMap.set(uid, []);
        }
        beaconRssiMap.get(uid)!.push(rssi);
      }
    }

    const sortedBeaconEntries = Array.from(beaconRssiMap.entries()).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    const beaconUids: string[] = [];
    const rssiMeans: number[] = [];
    const rssiStdDevs: number[] = [];

    for (const [uid, rssiValues] of sortedBeaconEntries) {
      beaconUids.push(uid);

      const mean = rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
      rssiMeans.push(mean);

      const variance =
        rssiValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        rssiValues.length;
      rssiStdDevs.push(Math.sqrt(variance));
    }

    const existing = await prisma.aggregatedFingerprint.findUnique({
      where: {
        buildingId_floorLevel_gridX_gridY: {
          buildingId: session.buildingId,
          floorLevel: session.floorLevel,
          gridX: point.x,
          gridY: point.y,
        },
      },
    });

    if (existing) {
      await prisma.aggregatedFingerprint.update({
        where: { id: existing.id },
        data: {
          beaconUids,
          rssiMeans,
          rssiStdDevs,
          sampleCount: point.samples.length,
          sessionId: session.id,
        },
      });
      pointsUpdated++;
    } else {
      await prisma.aggregatedFingerprint.create({
        data: {
          buildingId: session.buildingId,
          floorLevel: session.floorLevel,
          gridX: point.x,
          gridY: point.y,
          beaconUids,
          rssiMeans,
          rssiStdDevs,
          sampleCount: point.samples.length,
          sessionId: session.id,
        },
      });
      pointsCreated++;
    }
  }

  return {
    pointsProcessed: pointGroups.size,
    pointsCreated,
    pointsUpdated,
  };
};

/**
 * Get the radio map (aggregated fingerprints) for a building
 */
export const getRadioMap = async (
  buildingId: string,
  floorLevel?: number
): Promise<RadioMap> => {
  const where: any = { buildingId };
  if (floorLevel !== undefined) {
    where.floorLevel = floorLevel;
  }

  const aggregated = await prisma.aggregatedFingerprint.findMany({
    where,
    orderBy: [{ floorLevel: "asc" }, { gridX: "asc" }, { gridY: "asc" }],
  });

  return {
    buildingId,
    floorLevel,
    points: aggregated.map((a) => ({
      gridX: a.gridX,
      gridY: a.gridY,
      floorLevel: a.floorLevel,
      beaconUids: a.beaconUids,
      rssiMeans: a.rssiMeans,
      sampleCount: a.sampleCount,
    })),
    totalPoints: aggregated.length,
    generatedAt: new Date(),
  };
};

/**
 * Export fingerprints as CSV for analysis
 */
export const exportFingerprintsCSV = async (sessionId: string): Promise<string> => {
  const fingerprints = await prisma.bleFingerprint.findMany({
    where: { sessionId },
    orderBy: [{ x: "asc" }, { y: "asc" }, { sampleIndex: "asc" }],
  });

  if (fingerprints.length === 0) {
    return "";
  }

  const allBeacons = new Set<string>();
  for (const fp of fingerprints) {
    fp.beaconUids.forEach((uid) => allBeacons.add(uid));
  }
  const beaconList = Array.from(allBeacons).sort();

  const headers = ["x", "y", "floorLevel", "sampleIndex", ...beaconList];
  const rows = [headers.join(",")];

  for (const fp of fingerprints) {
    const rssiMap = new Map<string, number>();
    for (let i = 0; i < fp.beaconUids.length; i++) {
      rssiMap.set(fp.beaconUids[i], fp.rssis[i]);
    }

    const row = [
      fp.x,
      fp.y,
      fp.floorLevel,
      fp.sampleIndex ?? 0,
      ...beaconList.map((uid) => rssiMap.get(uid) ?? -100),
    ];
    rows.push(row.join(","));
  }

  return rows.join("\n");
};

/**
 * Export per-advertisement RAW readings as CSV for ML training.
 * One row per BLE advertisement (no aggregation/filtering).
 * Columns: capturedAt, x, y, floorLevel, beaconUid, rssi, gyroX, gyroY, gyroZ, fingerprintId
 */
export const exportRawReadingsCSV = async (sessionId: string): Promise<string> => {
  const session = await prisma.fingerprintSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new Error("Session not found");

  const fingerprints = await prisma.bleFingerprint.findMany({
    where: { sessionId },
    select: { id: true, floorLevel: true },
  });
  const fpMap = new Map(fingerprints.map((f) => [f.id, f.floorLevel]));

  if (fingerprints.length === 0) return "";

  const raws = await prisma.rawRssiReading.findMany({
    where: { fingerprintId: { in: fingerprints.map((f) => f.id) } },
    orderBy: { capturedAt: "asc" },
  });

  const headers = [
    "capturedAt",
    "x",
    "y",
    "floorLevel",
    "beaconUid",
    "rssi",
    "gyroX",
    "gyroY",
    "gyroZ",
    "fingerprintId",
  ];
  const rows = [headers.join(",")];
  for (const r of raws) {
    rows.push(
      [
        r.capturedAt.toISOString(),
        r.x,
        r.y,
        fpMap.get(r.fingerprintId) ?? "",
        r.beaconUid,
        r.rssi,
        r.gyroX ?? "",
        r.gyroY ?? "",
        r.gyroZ ?? "",
        r.fingerprintId,
      ].join(",")
    );
  }
  return rows.join("\n");
};

/**
 * Lightweight analytics for a session:
 * - per-point sample count
 * - beacon coverage (which beacons appeared at how many points)
 * - RSSI distribution stats
 */
export const getSessionAnalytics = async (sessionId: string) => {
  const session = await prisma.fingerprintSession.findUnique({
    where: { id: sessionId },
    include: {
      _count: { select: { fingerprints: true } },
    },
  });
  if (!session) throw new Error("Session not found");

  const fingerprints = await prisma.bleFingerprint.findMany({
    where: { sessionId },
    orderBy: [{ x: "asc" }, { y: "asc" }, { sampleIndex: "asc" }, { createdAt: "asc" }],
  });

  const pointMap = new Map<
    string,
    {
      x: number;
      y: number;
      sampleCount: number;
      rawCount: number;
      beacons: Set<string>;
      samples: { id: string; sampleIndex: number | null; createdAt: Date }[];
    }
  >();
  const beaconCoverage = new Map<string, Set<string>>(); // beaconUid -> set of "x,y"
  const rssiByBeacon = new Map<string, number[]>();

  const rawCounts = await prisma.rawRssiReading.groupBy({
    by: ["fingerprintId"],
    where: { fingerprintId: { in: fingerprints.map((f) => f.id) } },
    _count: true,
  });
  const rawCountByFp = new Map(rawCounts.map((r) => [r.fingerprintId, r._count]));

  for (const fp of fingerprints) {
    const key = `${fp.x},${fp.y}`;
    if (!pointMap.has(key)) {
      pointMap.set(key, {
        x: fp.x,
        y: fp.y,
        sampleCount: 0,
        rawCount: 0,
        beacons: new Set(),
        samples: [],
      });
    }
    const pt = pointMap.get(key)!;
    pt.sampleCount += 1;
    pt.rawCount += rawCountByFp.get(fp.id) ?? 0;
    pt.samples.push({ id: fp.id, sampleIndex: fp.sampleIndex, createdAt: fp.createdAt });

    for (let i = 0; i < fp.beaconUids.length; i++) {
      const uid = fp.beaconUids[i];
      const rssi = fp.rssis[i];
      pt.beacons.add(uid);
      if (!beaconCoverage.has(uid)) beaconCoverage.set(uid, new Set());
      beaconCoverage.get(uid)!.add(key);
      if (!rssiByBeacon.has(uid)) rssiByBeacon.set(uid, []);
      rssiByBeacon.get(uid)!.push(rssi);
    }
  }

  const points = Array.from(pointMap.values()).map((p) => ({
    x: p.x,
    y: p.y,
    sampleCount: p.sampleCount,
    rawReadingCount: p.rawCount,
    beaconCount: p.beacons.size,
    samples: p.samples.map((s) => ({
      id: s.id,
      sampleIndex: s.sampleIndex,
      createdAt: s.createdAt.toISOString(),
    })),
  }));

  const beacons = Array.from(beaconCoverage.entries()).map(([uid, pts]) => {
    const rssis = rssiByBeacon.get(uid) ?? [];
    const sum = rssis.reduce((a, b) => a + b, 0);
    const mean = rssis.length ? sum / rssis.length : 0;
    return {
      beaconUid: uid,
      pointsSeen: pts.size,
      sampleCount: rssis.length,
      meanRssi: Number(mean.toFixed(2)),
      minRssi: rssis.length ? Math.min(...rssis) : 0,
      maxRssi: rssis.length ? Math.max(...rssis) : 0,
    };
  });

  return {
    sessionId,
    name: session.name,
    status: session.status,
    floorLevel: session.floorLevel,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    totals: {
      uniquePoints: pointMap.size,
      totalSamples: fingerprints.length,
      totalRawReadings: Array.from(rawCountByFp.values()).reduce((a, b) => a + b, 0),
      uniqueBeacons: beaconCoverage.size,
    },
    points,
    beacons,
  };
};
