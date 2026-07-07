import prisma from "../../../lib/prisma";
import {
  CreateTrajectorySessionInput,
  UpdateTrajectorySessionInput,
  UploadWalksInput,
  UploadWalksResult,
  TrajectorySessionWithStats,
} from "./trajectory.types";

const BULK_CHUNK_SIZE = 1000;

const chunked = <T>(arr: T[], size = BULK_CHUNK_SIZE): T[][] => {
  if (arr.length <= size) return arr.length ? [arr] : [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

/** A single (x, y) ground-truth vertex stamped at absolute epoch-ms `t`. */
type LabelAnchor = { t: number; x: number; y: number };

/** A stationary pause in absolute epoch-ms. */
type PauseInterval = { start: number; end: number };

const toEpochMs = (d: string | Date): number =>
  d instanceof Date ? d.getTime() : new Date(d).getTime();

/**
 * Convert a walk's pause markers (monotonic tMs relative to walk start) into
 * absolute-epoch intervals. `resumeTMs` null/absent ⇒ the walk ended while
 * still paused, so the interval closes at `endedAt`. Zero/negative-width
 * intervals are dropped; the rest are returned sorted by start.
 */
const buildPauseIntervals = (walk: {
  startedAt: string | Date;
  endedAt: string | Date;
  pauses?: { pauseTMs: number; resumeTMs?: number | null }[];
}): PauseInterval[] => {
  const startEpoch = toEpochMs(walk.startedAt);
  const endEpoch = toEpochMs(walk.endedAt);
  return (walk.pauses ?? [])
    .map((p) => ({
      start: startEpoch + p.pauseTMs,
      end: p.resumeTMs != null ? startEpoch + p.resumeTMs : endEpoch,
    }))
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
};

/** Total stationary (paused) time elapsed at or before absolute time `t`. */
const pausedTimeBefore = (intervals: PauseInterval[], t: number): number => {
  let acc = 0;
  for (const iv of intervals) {
    if (t <= iv.start) break;
    acc += Math.min(t, iv.end) - iv.start;
  }
  return acc;
};

/**
 * Build the time-ordered ground-truth polyline for a walk:
 *   [ start @ startedAt, ...checkpoints @ capturedAt, end @ endedAt ]
 * sorted ascending by absolute epoch-ms.
 *
 * Replaces the old straight-line `stepIndex / totalSteps` assumption: a walk is
 * rarely a straight uniform-stride line, and the last step never reached the end
 * waypoint. With checkpoints the path bends through every marked (x, y), and
 * because the end anchor sits at `endedAt` a sample at end-time lands exactly on
 * (endX, endY).
 *
 * Pause-aware (moving clock): a marked pause means the walker stood still over
 * [pauseTMs, resumeTMs] — they cover the path during MOVING time only. We model
 * this with a moving clock that freezes during pauses: base anchors are mapped
 * to moving-time, then we emit a real-time polyline whose vertices are every
 * base anchor + pause boundary, positioned via that clock. Linear interpolation
 * of the returned polyline in real epoch-time therefore "moves between anchors
 * and holds still through each pause" — the held position is the correct
 * mid-segment point, not just a frozen-but-wrong value. With no pauses this is
 * exactly the old straight-line behavior. NOTE: this freezes only the LABEL —
 * every sensor sample recorded during the pause is kept (stationary noise data).
 */
const buildAnchors = (walk: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startedAt: string | Date;
  endedAt: string | Date;
  checkpoints?: { x: number; y: number; capturedAt: string | Date }[];
  pauses?: { pauseTMs: number; resumeTMs?: number | null }[];
}): LabelAnchor[] => {
  const base: LabelAnchor[] = [
    { t: toEpochMs(walk.startedAt), x: walk.startX, y: walk.startY },
    ...(walk.checkpoints ?? []).map((c) => ({
      t: toEpochMs(c.capturedAt),
      x: c.x,
      y: c.y,
    })),
    { t: toEpochMs(walk.endedAt), x: walk.endX, y: walk.endY },
  ];
  base.sort((a, b) => a.t - b.t);

  const intervals = buildPauseIntervals(walk);
  if (intervals.length === 0) return base;

  // Base anchors expressed in moving-time (pauses removed). Position is a
  // piecewise-linear function of moving-time over these.
  const movingAnchors: LabelAnchor[] = base.map((a) => ({
    t: a.t - pausedTimeBefore(intervals, a.t),
    x: a.x,
    y: a.y,
  }));

  // Real-time polyline vertices = base anchor times ∪ pause boundaries. The
  // moving clock is linear between these, so this set captures every breakpoint.
  const vertexTimes = new Set<number>();
  for (const a of base) vertexTimes.add(a.t);
  for (const iv of intervals) {
    vertexTimes.add(iv.start);
    vertexTimes.add(iv.end);
  }
  return [...vertexTimes]
    .sort((a, b) => a - b)
    .map((t) => {
      const pos = interpolateAtTime(movingAnchors, t - pausedTimeBefore(intervals, t));
      return { t, x: pos.x, y: pos.y };
    });
};

/**
 * Piecewise-linear interpolation of (x, y) at absolute time `t` over the anchor
 * polyline. Clamps to the first/last anchor outside the walk's time span.
 */
const interpolateAtTime = (
  anchors: LabelAnchor[],
  t: number
): { x: number; y: number } => {
  if (anchors.length === 0) return { x: 0, y: 0 };
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (t <= first.t) return { x: first.x, y: first.y };
  if (t >= last.t) return { x: last.x, y: last.y };
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const frac = span > 0 ? (t - a.t) / span : 0;
      return {
        x: a.x + frac * (b.x - a.x),
        y: a.y + frac * (b.y - a.y),
      };
    }
  }
  return { x: last.x, y: last.y };
};

export const createSession = async (data: CreateTrajectorySessionInput) => {
  const building = await prisma.building.findUnique({
    where: { id: data.buildingId },
  });
  if (!building) {
    throw Object.assign(new Error("Building not found"), { status: 404 });
  }

  return prisma.trajectorySession.create({
    data: {
      buildingId: data.buildingId,
      floorLevel: data.floorLevel,
      name: data.name,
      deviceModel: data.deviceModel,
      collectorId: data.collectorId,
      notes: data.notes,
      buildingVersion: data.buildingVersion,
      beaconLayoutVersion: data.beaconLayoutVersion,
      timeOfDay: data.timeOfDay,
      crowdLevel: data.crowdLevel,
      carryMode: data.carryMode,
      phoneAttitude: data.phoneAttitude,
      status: "IN_PROGRESS",
    },
  });
};

export const listSessions = async (
  buildingId?: string,
  floorLevel?: number,
  status?: string
): Promise<TrajectorySessionWithStats[]> => {
  const where: any = {};
  if (buildingId) where.buildingId = buildingId;
  if (floorLevel !== undefined) where.floorLevel = floorLevel;
  if (status) where.status = status;

  const sessions = await prisma.trajectorySession.findMany({
    where,
    include: {
      walks: {
        select: { totalSteps: true },
      },
      _count: { select: { walks: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  return sessions.map((s: any) => ({
    id: s.id,
    buildingId: s.buildingId,
    floorLevel: s.floorLevel,
    name: s.name,
    deviceModel: s.deviceModel,
    notes: s.notes,
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    walkCount: s._count.walks,
    totalSteps: s.walks.reduce((acc: number, w: any) => acc + (w.totalSteps ?? 0), 0),
  }));
};

export const getSessionById = async (id: string) => {
  const session = await prisma.trajectorySession.findUnique({
    where: { id },
    include: {
      walks: {
        select: {
          id: true,
          startX: true,
          startY: true,
          endX: true,
          endY: true,
          startedAt: true,
          endedAt: true,
          totalSteps: true,
          deviceModel: true,
          createdAt: true,
          _count: {
            select: { steps: true, imuSamples: true, bleReadings: true, wifiReadings: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { walks: true } },
    },
  });
  return session;
};

export const updateSession = async (id: string, data: UpdateTrajectorySessionInput) => {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.status) {
    updateData.status = data.status;
    if (data.status === "COMPLETED") {
      updateData.completedAt = new Date();
    }
  }

  return prisma.trajectorySession.update({
    where: { id },
    data: updateData,
  });
};

export const deleteSession = async (id: string) => {
  // Cascade-deletes walks + all their child rows via FK ON DELETE CASCADE.
  return prisma.trajectorySession.delete({ where: { id } });
};

/**
 * Persist a batch of walks for one session.
 *
 * Per walk: one TrajectoryWalk row plus bulk inserts of step events, IMU
 * samples, BLE readings, WiFi readings, and checkpoint waypoints. Each walk
 * runs in its own transaction so a mid-upload failure leaves no partial walk
 * (but earlier successful walks remain saved — important for long sessions).
 *
 * Idempotent (B6): a walk carrying a `clientId` already present in this session
 * is skipped, so a client that retries after a flaky upload never duplicates.
 *
 * Steps are labelled server-side by piecewise-linear interpolation over the
 * checkpoint-anchored polyline at each step's capturedAt — the AI team can
 * re-derive any other labelling from the raw IMU stream stored alongside.
 */
export const uploadWalks = async (data: UploadWalksInput): Promise<UploadWalksResult> => {
  const session = await prisma.trajectorySession.findUnique({
    where: { id: data.sessionId },
  });
  if (!session) {
    throw Object.assign(new Error("Trajectory session not found"), { status: 404 });
  }
  if (session.status === "ARCHIVED") {
    throw Object.assign(new Error("Cannot add walks to archived session"), { status: 400 });
  }

  // Only accept BLE readings from beacons registered to this building — a
  // foreign/fabricated beaconUid must never enter the training dataset. Dropped
  // readings are counted and reported, not fatal (a stray advert shouldn't void
  // an otherwise good walk).
  const registeredBeacons = await prisma.bleBeacon.findMany({
    where: { buildingId: session.buildingId },
    select: { beaconUid: true },
  });
  const allowedUids = new Set(
    registeredBeacons.map((b: { beaconUid: string }) => b.beaconUid.toLowerCase())
  );

  let walksCreated = 0;
  let walksSkipped = 0;
  let stepsCreated = 0;
  let imuSamplesCreated = 0;
  let bleReadingsCreated = 0;
  let bleReadingsDroppedUnknownBeacon = 0;
  let wifiReadingsCreated = 0;
  let checkpointsCreated = 0;
  let pausesCreated = 0;

  for (const walk of data.walks) {
    // B6 idempotency: skip a walk we've already stored under this clientId.
    if (walk.clientId) {
      const existing = await prisma.trajectoryWalk.findFirst({
        where: { sessionId: session.id, clientId: walk.clientId },
        select: { id: true },
      });
      if (existing) {
        walksSkipped++;
        continue;
      }
    }

    // B2: ground-truth polyline through start → checkpoints → end.
    const anchors = buildAnchors(walk);

    await prisma.$transaction(async (tx: any) => {
      const walkRow = await tx.trajectoryWalk.create({
        data: {
          sessionId: session.id,
          buildingId: session.buildingId,
          floorLevel: session.floorLevel,
          startX: walk.startX,
          startY: walk.startY,
          endX: walk.endX,
          endY: walk.endY,
          startedAt: new Date(walk.startedAt),
          endedAt: new Date(walk.endedAt),
          totalSteps: walk.totalSteps,
          deviceModel: data.deviceModel || session.deviceModel,
          clientId: walk.clientId ?? null,
          clockEpochMs: walk.clockEpochMs ?? null,
          imuRateHz: walk.imuRateHz ?? null,
          magCalibrated: walk.magCalibrated ?? null,
        },
      });

      if (walk.checkpoints && walk.checkpoints.length > 0) {
        const cpRows = walk.checkpoints.map((c) => ({
          walkId: walkRow.id,
          seq: c.seq,
          x: c.x,
          y: c.y,
          tMs: c.tMs,
          capturedAt: new Date(c.capturedAt),
        }));
        for (const chunk of chunked(cpRows)) {
          await tx.trajectoryCheckpoint.createMany({ data: chunk });
        }
        checkpointsCreated += cpRows.length;
      }

      if (walk.pauses && walk.pauses.length > 0) {
        const pauseRows = walk.pauses.map((p) => ({
          walkId: walkRow.id,
          seq: p.seq,
          pauseTMs: p.pauseTMs,
          resumeTMs: p.resumeTMs ?? null,
        }));
        for (const chunk of chunked(pauseRows)) {
          await tx.trajectoryPauseEvent.createMany({ data: chunk });
        }
        pausesCreated += pauseRows.length;
      }

      if (walk.steps.length > 0) {
        const stepRows = walk.steps.map((s) => {
          const pos = interpolateAtTime(anchors, toEpochMs(s.capturedAt));
          return {
            walkId: walkRow.id,
            stepIndex: s.stepIndex,
            capturedAt: new Date(s.capturedAt),
            tMs: s.tMs ?? null,
            headingRad: s.headingRad,
            compassDeg: s.compassDeg ?? null,
            interpolatedX: pos.x,
            interpolatedY: pos.y,
          };
        });
        for (const chunk of chunked(stepRows)) {
          await tx.trajectoryStepEvent.createMany({ data: chunk });
        }
        stepsCreated += stepRows.length;
      }

      if (walk.imu.length > 0) {
        const imuRows = walk.imu.map((r) => ({
          walkId: walkRow.id,
          capturedAt: new Date(r.capturedAt),
          tMs: r.tMs ?? null,
          gyroX: r.gyroX ?? null,
          gyroY: r.gyroY ?? null,
          gyroZ: r.gyroZ ?? null,
          accelX: r.accelX ?? null,
          accelY: r.accelY ?? null,
          accelZ: r.accelZ ?? null,
          userAccelX: r.userAccelX ?? null,
          userAccelY: r.userAccelY ?? null,
          userAccelZ: r.userAccelZ ?? null,
          magX: r.magX ?? null,
          magY: r.magY ?? null,
          magZ: r.magZ ?? null,
          pitch: r.pitch ?? null,
          roll: r.roll ?? null,
          yaw: r.yaw ?? null,
          pressure: r.pressure ?? null,
          relativeAltitude: r.relativeAltitude ?? null,
          vertAccel: r.vertAccel ?? null,
          gaitVerticality: r.gaitVerticality ?? null,
          gaitEnergy: r.gaitEnergy ?? null,
          gaitIsWalking: r.gaitIsWalking ?? null,
          gaitAmplitude: r.gaitAmplitude ?? null,
          compassDeg: r.compassDeg ?? null,
          compassAccuracyDeg: r.compassAccuracyDeg ?? null,
        }));
        for (const chunk of chunked(imuRows)) {
          await tx.trajectoryImuSample.createMany({ data: chunk });
        }
        imuSamplesCreated += imuRows.length;
      }

      if (walk.ble.length > 0) {
        const acceptedBle = walk.ble.filter((r) =>
          allowedUids.has(r.beaconUid.toLowerCase())
        );
        bleReadingsDroppedUnknownBeacon += walk.ble.length - acceptedBle.length;
        const bleRows = acceptedBle.map((r) => ({
          walkId: walkRow.id,
          capturedAt: new Date(r.capturedAt),
          tMs: r.tMs ?? null,
          beaconUid: r.beaconUid,
          rssi: r.rssi,
        }));
        for (const chunk of chunked(bleRows)) {
          await tx.trajectoryBleReading.createMany({ data: chunk });
        }
        bleReadingsCreated += bleRows.length;
      }

      if (walk.wifi && walk.wifi.length > 0) {
        const wifiRows = walk.wifi.map((r) => ({
          walkId: walkRow.id,
          capturedAt: new Date(r.capturedAt),
          tMs: r.tMs ?? null,
          bssid: r.bssid,
          ssid: r.ssid ?? null,
          rssi: r.rssi,
          frequencyMhz: r.frequencyMhz ?? null,
        }));
        for (const chunk of chunked(wifiRows)) {
          await tx.trajectoryWifiReading.createMany({ data: chunk });
        }
        wifiReadingsCreated += wifiRows.length;
      }

      walksCreated++;
    });
  }

  return {
    walksCreated,
    walksSkipped,
    stepsCreated,
    imuSamplesCreated,
    bleReadingsCreated,
    bleReadingsDroppedUnknownBeacon,
    wifiReadingsCreated,
    checkpointsCreated,
    pausesCreated,
  };
};

/**
 * Export one session's raw walks for the AI team. Returns the full walk
 * payload including every IMU sample, BLE/WiFi reading, and step event.
 * Use the `walkCursor` (last walk id) to paginate when sessions get large.
 */
export const exportSession = async (
  sessionId: string,
  walkCursor?: string,
  walkLimit = 25
) => {
  const session = await prisma.trajectorySession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw Object.assign(new Error("Trajectory session not found"), { status: 404 });
  }

  const walks = await prisma.trajectoryWalk.findMany({
    where: { sessionId },
    take: walkLimit + 1,
    ...(walkCursor ? { cursor: { id: walkCursor }, skip: 1 } : {}),
    orderBy: { createdAt: "asc" },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
      imuSamples: { orderBy: { capturedAt: "asc" } },
      bleReadings: { orderBy: { capturedAt: "asc" } },
      wifiReadings: { orderBy: { capturedAt: "asc" } },
      checkpoints: { orderBy: { seq: "asc" } },
    },
  });

  const hasMore = walks.length > walkLimit;
  const page = hasMore ? walks.slice(0, walkLimit) : walks;

  return {
    session: {
      id: session.id,
      buildingId: session.buildingId,
      floorLevel: session.floorLevel,
      name: session.name,
      deviceModel: session.deviceModel,
      notes: session.notes,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    walks: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
};

/** One row of the replay tape: a sensor event tagged with its ground-truth (x, y). */
interface ReplayEvent {
  tMs: number; // ms since walk start (faithful monotonic clock when recorded)
  type: "imu" | "ble" | "wifi" | "step";
  x: number;
  y: number;
  payload: Record<string, any>;
}

/**
 * Build a "replay tape" for one session (B3). For each walk we emit:
 *   - `anchors`: the ground-truth polyline (start → checkpoints → end), tMs-relative
 *   - `events`: every IMU / BLE / WiFi / step sample merged into ONE array sorted
 *     by time, each tagged with the interpolated (x, y) at that instant.
 *
 * This is exactly what an offline simulator feeds a trained model: replay the
 * events in order, ask the model for a position, compare against (x, y). Labels
 * are computed on the fly via `interpolateAtTime` — no extra stored columns.
 *
 * `tMs` per event prefers the recorded monotonic value; legacy rows without it
 * fall back to (capturedAt − startedAt). Interpolation always uses the absolute
 * capturedAt clock so it stays consistent with the anchor timestamps.
 */
export const replaySession = async (
  sessionId: string,
  walkCursor?: string,
  walkLimit = 25
) => {
  const session = await prisma.trajectorySession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw Object.assign(new Error("Trajectory session not found"), { status: 404 });
  }

  const walks = await prisma.trajectoryWalk.findMany({
    where: { sessionId },
    take: walkLimit + 1,
    ...(walkCursor ? { cursor: { id: walkCursor }, skip: 1 } : {}),
    orderBy: { createdAt: "asc" },
    include: {
      steps: { orderBy: { stepIndex: "asc" } },
      imuSamples: { orderBy: { capturedAt: "asc" } },
      bleReadings: { orderBy: { capturedAt: "asc" } },
      wifiReadings: { orderBy: { capturedAt: "asc" } },
      checkpoints: { orderBy: { seq: "asc" } },
      pauseEvents: { orderBy: { seq: "asc" } },
    },
  });

  const hasMore = walks.length > walkLimit;
  const page = hasMore ? walks.slice(0, walkLimit) : walks;

  const replayWalks = page.map((walk: any) => {
    // Pause-aware anchors: hold the ground-truth label still across each pause
    // (sensor events recorded during the pause are still emitted with that held
    // position — stationary data is preserved, not dropped).
    const anchors = buildAnchors({ ...walk, pauses: walk.pauseEvents });
    const startMs = toEpochMs(walk.startedAt);

    // Relative time of an event: prefer recorded monotonic tMs, else derive.
    const relMs = (capturedAt: Date, tMs: number | null): number =>
      tMs != null ? tMs : toEpochMs(capturedAt) - startMs;

    const events: ReplayEvent[] = [];

    for (const s of walk.steps) {
      const pos = interpolateAtTime(anchors, toEpochMs(s.capturedAt));
      events.push({
        tMs: relMs(s.capturedAt, s.tMs),
        type: "step",
        x: pos.x,
        y: pos.y,
        payload: { stepIndex: s.stepIndex, headingRad: s.headingRad, compassDeg: s.compassDeg },
      });
    }

    for (const r of walk.imuSamples) {
      const pos = interpolateAtTime(anchors, toEpochMs(r.capturedAt));
      events.push({
        tMs: relMs(r.capturedAt, r.tMs),
        type: "imu",
        x: pos.x,
        y: pos.y,
        payload: {
          gyroX: r.gyroX, gyroY: r.gyroY, gyroZ: r.gyroZ,
          accelX: r.accelX, accelY: r.accelY, accelZ: r.accelZ,
          userAccelX: r.userAccelX, userAccelY: r.userAccelY, userAccelZ: r.userAccelZ,
          magX: r.magX, magY: r.magY, magZ: r.magZ,
          pitch: r.pitch, roll: r.roll, yaw: r.yaw,
          pressure: r.pressure, relativeAltitude: r.relativeAltitude,
          // On-device gait state (null on legacy rows recorded before this).
          vertAccel: r.vertAccel, gaitVerticality: r.gaitVerticality,
          gaitEnergy: r.gaitEnergy, gaitIsWalking: r.gaitIsWalking,
          gaitAmplitude: r.gaitAmplitude,
          // Absolute OS-fused compass (null on legacy rows).
          compassDeg: r.compassDeg, compassAccuracyDeg: r.compassAccuracyDeg,
        },
      });
    }

    for (const r of walk.bleReadings) {
      const pos = interpolateAtTime(anchors, toEpochMs(r.capturedAt));
      events.push({
        tMs: relMs(r.capturedAt, r.tMs),
        type: "ble",
        x: pos.x,
        y: pos.y,
        payload: { beaconUid: r.beaconUid, rssi: r.rssi },
      });
    }

    for (const r of walk.wifiReadings) {
      const pos = interpolateAtTime(anchors, toEpochMs(r.capturedAt));
      events.push({
        tMs: relMs(r.capturedAt, r.tMs),
        type: "wifi",
        x: pos.x,
        y: pos.y,
        payload: { bssid: r.bssid, ssid: r.ssid, rssi: r.rssi, frequencyMhz: r.frequencyMhz },
      });
    }

    // Stable time-order; ties broken so a step's label is easy to eyeball.
    events.sort((a, b) => a.tMs - b.tMs);

    return {
      id: walk.id,
      clientId: walk.clientId,
      startX: walk.startX,
      startY: walk.startY,
      endX: walk.endX,
      endY: walk.endY,
      startedAt: walk.startedAt,
      endedAt: walk.endedAt,
      totalSteps: walk.totalSteps,
      deviceModel: walk.deviceModel,
      clockEpochMs: walk.clockEpochMs,
      imuRateHz: walk.imuRateHz,
      magCalibrated: walk.magCalibrated,
      anchors: anchors.map((a) => ({ tMs: a.t - startMs, x: a.x, y: a.y })),
      pauses: (walk.pauseEvents ?? []).map((p: any) => ({
        seq: p.seq,
        pauseTMs: p.pauseTMs,
        resumeTMs: p.resumeTMs ?? undefined,
      })),
      eventCount: events.length,
      events,
    };
  });

  return {
    session: {
      id: session.id,
      buildingId: session.buildingId,
      floorLevel: session.floorLevel,
      name: session.name,
      deviceModel: session.deviceModel,
      notes: session.notes,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      buildingVersion: session.buildingVersion,
      beaconLayoutVersion: session.beaconLayoutVersion,
      timeOfDay: session.timeOfDay,
      crowdLevel: session.crowdLevel,
      carryMode: session.carryMode,
      phoneAttitude: session.phoneAttitude,
    },
    walks: replayWalks,
    nextCursor: hasMore ? replayWalks[replayWalks.length - 1].id : null,
  };
};
