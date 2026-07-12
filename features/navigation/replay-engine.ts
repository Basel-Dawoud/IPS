/**
 * In-app trajectory replay engine.
 * Adapted from GraduationProject for Navimind.
 */
import { GatLocalizer, warmSession } from "../positioning/gat";
import { getGatConfig, type GatVariant } from "../positioning/gat/model-configs";
import {
  beaconIdForUid,
  WIFI_ABSENT_RSSI,
  ZERO_IMU,
  type ImuSnapshot,
  type ObservationRow,
} from "../positioning/gat/constants";
import {
  CVFilter,
  beaconRFactor,
  m2inv,
  m2mul,
  m2T,
  m2vec,
  type Mat2,
  type Vec2,
} from "../positioning/gat/cv-filter";
import type { PostProcessMode, MotionContext } from "../positioning/gat/localizer";

export interface PauseMarker {
  seq: number;
  pauseTMs: number;
  resumeTMs?: number;
}

export interface ReplayEvent {
  tMs: number;
  type: "imu" | "ble" | "wifi" | "step";
  x: number;
  y: number;
  payload: Record<string, any>;
}

export interface ReplayAnchor {
  tMs: number;
  x: number;
  y: number;
}

export interface ReplayWalk {
  id: string;
  clientId?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startedAt: string;
  endedAt: string;
  totalSteps: number;
  deviceModel?: string | null;
  clockEpochMs?: number | null;
  imuRateHz?: number | null;
  magCalibrated?: boolean | null;
  anchors: ReplayAnchor[];
  pauses: PauseMarker[];
  eventCount: number;
  events: ReplayEvent[];
}

export interface ReplayOptions {
  variant: GatVariant;
  mode?: PostProcessMode;
  bleWindowMs?: number;
  floorTrue: number;
}

export interface ReplaySample {
  tMs: number;
  yRaw: number | null;
  y: number | null;
  yRts: number | null;
  floor: number | null;
  yTrue: number;
  floorTrue: number;
  uniqueBeacons: number;
  bleUniqueBeacons: number;
  bleScanCount: number;
  bleGatePassed: boolean;
  tickGaitVerticality: number | null;
  tickGaitIsWalking: boolean | null;
  tickGaitEnergy: number | null;
}

export interface ReplayMetrics {
  ticks: number;
  predicted: number;
  maeRaw: number | null;
  mae: number | null;
  maeRts: number | null;
  acc1m: number | null;
  acc2m: number | null;
  acc5m: number | null;
  acc8m: number | null;
  acc10m: number | null;
  floorAcc: number | null;
  p90: number | null;
  predYRange: [number, number] | null;
  truthYRange: [number, number] | null;
  maeInverted: number | null;
  groundTruthInverted: boolean;
}

export interface ReplayResult {
  variant: GatVariant;
  mode: PostProcessMode;
  durationMs: number;
  samples: ReplaySample[];
  metrics: ReplayMetrics;
}

function imuFromPayload(p: Record<string, any>): ImuSnapshot {
  return {
    gyroX: p.gyroX ?? 0,
    gyroY: p.gyroY ?? 0,
    gyroZ: p.gyroZ ?? 0,
    accelX: p.accelX ?? 0,
    accelY: p.accelY ?? 0,
    accelZ: p.accelZ ?? 0,
    userAccelX: p.userAccelX ?? 0,
    userAccelY: p.userAccelY ?? 0,
    userAccelZ: p.userAccelZ ?? 0,
    magX: p.magX ?? 0,
    magY: p.magY ?? 0,
    magZ: p.magZ ?? 0,
    pitch: p.pitch ?? 0,
    roll: p.roll ?? 0,
    yaw: p.yaw ?? 0,
  };
}

function interpolateY(anchors: ReplayAnchor[], tMs: number): number {
  if (anchors.length === 0) return 0;
  if (tMs <= anchors[0].tMs) return anchors[0].y;
  const last = anchors[anchors.length - 1];
  if (tMs >= last.tMs) return last.y;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (tMs <= b.tMs) {
      const span = Math.max(1, b.tMs - a.tMs);
      const f = (tMs - a.tMs) / span;
      return a.y + f * (b.y - a.y);
    }
  }
  return last.y;
}

function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

function rtsSmoothCV(points: { t: number; z: number; beacons: number }[]): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [points[0].z];

  const xf: Vec2[] = new Array(n);
  const Pf: Mat2[] = new Array(n);
  const xp: Vec2[] = new Array(n);
  const Pp: Mat2[] = new Array(n);
  const Fs: Mat2[] = new Array(n);

  const f = new CVFilter();
  let last: number | null = null;
  for (let k = 0; k < n; k++) {
    const dt = last == null ? 1 : (points[k].t - last) / 1000;
    last = points[k].t;
    f.update(points[k].z, dt, 1, beaconRFactor(points[k].beacons));
    xf[k] = f.xVec;
    Pf[k] = f.P;
    xp[k] = f.lastXPred;
    Pp[k] = f.lastPpred;
    Fs[k] = f.lastF;
  }

  const xs: Vec2[] = new Array(n);
  const Ps: Mat2[] = new Array(n);
  xs[n - 1] = xf[n - 1];
  Ps[n - 1] = Pf[n - 1];
  for (let k = n - 2; k >= 0; k--) {
    const F = Fs[k + 1];
    const C = m2mul(m2mul(Pf[k], m2T(F)), m2inv(Pp[k + 1]));
    const dx: Vec2 = [xs[k + 1][0] - xp[k + 1][0], xs[k + 1][1] - xp[k + 1][1]];
    const corr = m2vec(C, dx);
    xs[k] = [xf[k][0] + corr[0], xf[k][1] + corr[1]];
    const dP: Mat2 = [
      Ps[k + 1][0] - Pp[k + 1][0], Ps[k + 1][1] - Pp[k + 1][1],
      Ps[k + 1][2] - Pp[k + 1][2], Ps[k + 1][3] - Pp[k + 1][3],
    ];
    const CdPCt = m2mul(m2mul(C, dP), m2T(C));
    Ps[k] = [Pf[k][0] + CdPCt[0], Pf[k][1] + CdPCt[1], Pf[k][2] + CdPCt[2], Pf[k][3] + CdPCt[3]];
  }
  return xs.map((x) => x[0]);
}

const Y_MAX = 93;

function range(vals: number[]): [number, number] {
  return [Math.min(...vals), Math.max(...vals)];
}

function computeMetrics(samples: ReplaySample[], floorTrue: number): ReplayMetrics {
  const valid = samples.filter((s) => s.y != null && s.yRaw != null);
  const ticks = samples.length;
  if (valid.length === 0) {
    return {
      ticks,
      predicted: 0,
      maeRaw: null,
      mae: null,
      maeRts: null,
      acc1m: null,
      acc2m: null,
      acc5m: null,
      acc8m: null,
      acc10m: null,
      floorAcc: null,
      p90: null,
      predYRange: null,
      truthYRange: null,
      maeInverted: null,
      groundTruthInverted: false,
    };
  }
  const errs = valid.map((s) => Math.abs((s.y as number) - s.yTrue)).sort((a, b) => a - b);
  const errsRaw = valid.map((s) => Math.abs((s.yRaw as number) - s.yTrue));
  const rtsErrs = valid.filter((s) => s.yRts != null).map((s) => Math.abs((s.yRts as number) - s.yTrue));
  const errsInv = valid.map((s) => Math.abs((s.y as number) - (Y_MAX - s.yTrue)));
  const p90 = errs[Math.min(errs.length - 1, Math.floor(0.9 * errs.length))];
  const mae = mean(errs);
  const maeInverted = mean(errsInv);
  return {
    ticks,
    predicted: valid.length,
    maeRaw: mean(errsRaw),
    mae,
    maeRts: rtsErrs.length ? mean(rtsErrs) : null,
    acc1m: (errs.filter((e) => e <= 1).length / errs.length) * 100,
    acc2m: (errs.filter((e) => e <= 2).length / errs.length) * 100,
    acc5m: (errs.filter((e) => e <= 5).length / errs.length) * 100,
    acc8m: (errs.filter((e) => e <= 8).length / errs.length) * 100,
    acc10m: (errs.filter((e) => e <= 10).length / errs.length) * 100,
    floorAcc: mean(valid.map((s) => (s.floor === floorTrue ? 1 : 0))) * 100,
    p90,
    predYRange: range(valid.map((s) => s.y as number)),
    truthYRange: range(valid.map((s) => s.yTrue)),
    maeInverted,
    groundTruthInverted: maeInverted < mae * 0.5 && mae > 5,
  };
}

export async function replayWalk(walk: ReplayWalk, opts: ReplayOptions): Promise<ReplayResult> {
  const mode = opts.mode ?? "kalman";
  const bleWindowMs = opts.bleWindowMs ?? 1000;

  await warmSession(opts.variant);
  const loc = new GatLocalizer(opts.variant);
  loc.setPostProcessMode(mode);

  const cfg = getGatConfig(opts.variant);
  const isTime = cfg.windowMode === "time";
  const strideMs = cfg.strideMs ?? 500;
  const tickMs = isTime ? 150 : bleWindowMs;
  const perTickWindow = isTime ? Math.min(bleWindowMs, 250) : bleWindowMs;

  const gateMin = cfg.minBeacons ?? 4;

  const ble = walk.events.filter((e) => e.type === "ble");
  const imu = walk.events
    .filter((e) => e.type === "imu")
    .map((e) => ({
      tMs: e.tMs,
      imu: imuFromPayload(e.payload),
      gaitVerticality:
        typeof e.payload.gaitVerticality === "number" ? e.payload.gaitVerticality : null,
      gaitIsWalking:
        typeof e.payload.gaitIsWalking === "boolean" ? e.payload.gaitIsWalking : null,
      gaitEnergy: typeof e.payload.gaitEnergy === "number" ? e.payload.gaitEnergy : null,
    }));
  const steps = walk.events.filter((e) => e.type === "step").map((e) => e.tMs);

  const endMs = walk.events.length ? walk.events[walk.events.length - 1].tMs : 0;

  const samples: ReplaySample[] = [];
  let lastPredict = -Infinity;
  let imuPtr = 0;
  let stepPtr = 0;

  for (let T = tickMs; T <= endMs + tickMs; T += tickMs) {
    const lo = T - perTickWindow;

    const sum = new Map<number, number>();
    const cnt = new Map<number, number>();
    let scanCount = 0;
    for (const e of ble) {
      if (e.tMs <= lo) continue;
      if (e.tMs > T) break;
      const id = beaconIdForUid(String(e.payload.beaconUid ?? ""));
      const rssi = Number(e.payload.rssi);
      if (id > 0 && Number.isFinite(rssi)) {
        sum.set(id, (sum.get(id) ?? 0) + rssi);
        cnt.set(id, (cnt.get(id) ?? 0) + 1);
        scanCount++;
      }
    }
    if (sum.size === 0) continue;

    const bleUniqueBeacons = sum.size;
    const bleGatePassed = bleUniqueBeacons >= gateMin;

    while (imuPtr + 1 < imu.length && imu[imuPtr + 1].tMs <= T) imuPtr++;
    const snap: ImuSnapshot = imu.length ? imu[imuPtr].imu : ZERO_IMU;
    const gaitSnap = imu.length ? imu[imuPtr] : null;

    const rows: ObservationRow[] = [];
    sum.forEach((s, id) => {
      const n = cnt.get(id) ?? 1;
      rows.push({ beaconId: id, rssi: s / n, capturedAt: T, imu: snap, wifiRssi: WIFI_ABSENT_RSSI });
    });
    loc.addObservations(rows);

    if (isTime && T - lastPredict < strideMs) continue;

    let nSteps = 0;
    while (stepPtr < steps.length && steps[stepPtr] <= T) {
      if (steps[stepPtr] > lastPredict) nSteps++;
      stepPtr++;
    }
    const motion: MotionContext = {
      isWalking: nSteps > 0,
      steps: nSteps,
      walkingConfidence: Math.min(1, nSteps / 2),
    };
    lastPredict = T;

    const pred = await loc.predict(motion);
    samples.push({
      tMs: T,
      yRaw: pred ? pred.yRaw : null,
      y: pred ? pred.y : null,
      yRts: null,
      floor: pred ? pred.floor : null,
      yTrue: interpolateY(walk.anchors, T),
      floorTrue: opts.floorTrue,
      uniqueBeacons: pred ? pred.uniqueBeacons : 0,
      bleUniqueBeacons,
      bleScanCount: scanCount,
      bleGatePassed,
      tickGaitVerticality: gaitSnap ? gaitSnap.gaitVerticality : null,
      tickGaitIsWalking: gaitSnap ? gaitSnap.gaitIsWalking : null,
      tickGaitEnergy: gaitSnap ? gaitSnap.gaitEnergy : null,
    });
  }

  const rtsPts: { i: number; t: number; z: number; beacons: number }[] = [];
  samples.forEach((s, i) => {
    if (s.yRaw != null) rtsPts.push({ i, t: s.tMs, z: s.yRaw, beacons: s.bleUniqueBeacons });
  });
  if (rtsPts.length >= 2) {
    const smoothed = rtsSmoothCV(rtsPts.map((p) => ({ t: p.t, z: p.z, beacons: p.beacons })));
    rtsPts.forEach((p, k) => {
      samples[p.i].yRts = smoothed[k];
    });
  } else if (rtsPts.length === 1) {
    samples[rtsPts[0].i].yRts = rtsPts[0].z;
  }

  return {
    variant: opts.variant,
    mode,
    durationMs: endMs,
    samples,
    metrics: computeMetrics(samples, opts.floorTrue),
  };
}
