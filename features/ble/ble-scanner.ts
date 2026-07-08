/**
 * BLE scanner — single shared source of beacon RSSI advertisements.
 *
 * Continuous-scan only (no fingerprint collection): one persistent scan
 * fills a per-beacon rolling RSSI buffer, and `getWindowMeans(ms)` returns
 * the arithmetic mean RSSI per beacon over the requested trailing window.
 * That output feeds the on-device ONNX positioner.
 *
 * All shared state lives at module scope so every screen sees the same
 * scan / buffer.
 */
import { getBleManager } from "./lazy-ble";
import { identifyBeacon, deriveDisplayName } from "./beacon-parsing";
import {
  RSSI_MIN,
  SCAN_MODE_LOW_LATENCY,
  STALL_THRESHOLD_MS,
  MIN_RESTART_INTERVAL_MS,
  DISCOVERED_NOTIFY_THROTTLE_MS,
} from "./constants";

export interface DiscoveredBeacon {
  uid: string;
  name: string | null;
  rssi: number;
}

type BufEntry = { rssi: number; ts: number };

const rawBuffer = new Map<string, BufEntry[]>();
const discoveredBeacons = new Map<string, DiscoveredBeacon>();
const discoveredListeners = new Set<() => void>();

let active = false;
let maxAgeMs = 5_000;
let allowedUids: Set<string> | null = null;

let lastAdAt = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let lastRestart = 0;

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
let notifyPending = false;

// ── Discovery listeners (throttled) ──

function notify() {
  discoveredListeners.forEach((l) => l());
}

function notifyThrottled() {
  if (notifyTimer) {
    notifyPending = true;
    return;
  }
  notify();
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    if (notifyPending) {
      notifyPending = false;
      notify();
    }
  }, DISCOVERED_NOTIFY_THROTTLE_MS);
}

export function subscribeDiscovered(listener: () => void): () => void {
  discoveredListeners.add(listener);
  return () => discoveredListeners.delete(listener);
}

export function getDiscoveredBeacons(): ReadonlyMap<string, DiscoveredBeacon> {
  return discoveredBeacons;
}

export function clearDiscoveredBeacons(): void {
  discoveredBeacons.clear();
  notify();
}

// ── Scan callback ──

function isValidRssi(r: number | null | undefined): r is number {
  return typeof r === "number" && r >= RSSI_MIN;
}

function onAdvertisement(error: any, device: any): void {
  lastAdAt = Date.now();
  if (error) {
    console.warn("[BLE] Scan error:", error?.message);
    return;
  }
  if (!device || !isValidRssi(device.rssi)) return;

  const uid = identifyBeacon(device);
  if (!uid) return;

  const existing = discoveredBeacons.get(uid);
  discoveredBeacons.set(uid, {
    uid,
    name: device.localName || device.name || existing?.name || deriveDisplayName(device.id, uid),
    rssi: device.rssi,
  });
  notifyThrottled();

  if (allowedUids && !allowedUids.has(uid.toLowerCase())) return;

  const now = Date.now();
  const arr = rawBuffer.get(uid) ?? [];
  arr.push({ rssi: device.rssi, ts: now });

  const cutoff = now - maxAgeMs;
  let i = 0;
  while (i < arr.length && arr[i].ts < cutoff) i++;
  if (i > 0) arr.splice(0, i);

  rawBuffer.set(uid, arr);
}

// ── Public API ──

export function startContinuousScan(options: {
  maxBufferAgeMs?: number;
  allowedUids?: Set<string> | string[];
} = {}): boolean {
  const mgr = getBleManager();
  if (!mgr) return false;

  try { mgr.stopDeviceScan(); } catch {}

  rawBuffer.clear();
  active = true;
  maxAgeMs = options.maxBufferAgeMs ?? 5_000;
  const raw = options.allowedUids;
  allowedUids = raw
    ? new Set(Array.from(raw, (u) => u.toLowerCase()))
    : null;
  lastAdAt = Date.now();
  lastRestart = 0;

  // Watchdog: if the radio falls silent, stop+restart the scan without
  // wiping the buffer. Rate-limited to MIN_RESTART_INTERVAL_MS.
  if (watchdogTimer) clearInterval(watchdogTimer);
  watchdogTimer = setInterval(() => {
    if (!active) return;
    const now = Date.now();
    if (now - lastAdAt < STALL_THRESHOLD_MS) return;
    if (now - lastRestart < MIN_RESTART_INTERVAL_MS) return;
    lastRestart = now;
    const m = getBleManager();
    if (!m) return;
    try { m.stopDeviceScan(); } catch {}
    try {
      m.startDeviceScan(null, { allowDuplicates: true, scanMode: SCAN_MODE_LOW_LATENCY }, onAdvertisement);
      lastAdAt = Date.now();
    } catch (e: any) {
      console.warn("[BLE] Watchdog restart failed:", e?.message);
    }
  }, 1_000);

  mgr.startDeviceScan(
    null,
    { allowDuplicates: true, scanMode: SCAN_MODE_LOW_LATENCY },
    onAdvertisement,
  );
  return true;
}

export function stopContinuousScan(): void {
  active = false;
  rawBuffer.clear();
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  const mgr = getBleManager();
  if (mgr) {
    try { mgr.stopDeviceScan(); } catch {}
  }
}

export function isScanning(): boolean {
  return active;
}

/** Per-beacon arithmetic mean RSSI over the last `windowMs`. */
export function getWindowMeans(windowMs: number): Map<string, number> {
  const out = new Map<string, number>();
  const cutoff = Date.now() - windowMs;
  rawBuffer.forEach((arr, uid) => {
    let sum = 0;
    let count = 0;
    for (const e of arr) {
      if (e.ts >= cutoff) { sum += e.rssi; count++; }
    }
    if (count > 0) out.set(uid, Math.round(sum / count));
  });
  return out;
}

/** Per-beacon advertisement count over the last `windowMs`. */
export function getWindowCounts(windowMs: number): Map<string, number> {
  const out = new Map<string, number>();
  const cutoff = Date.now() - windowMs;
  rawBuffer.forEach((arr, uid) => {
    let count = 0;
    for (const e of arr) if (e.ts >= cutoff) count++;
    if (count > 0) out.set(uid, count);
  });
  return out;
}
