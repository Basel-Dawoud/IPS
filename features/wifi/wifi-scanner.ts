/**
 * Single-AP WiFi scanner for the GAT WiFi variants (wifi_v1 / wifi_v2).
 *
 * The two WiFi models consume exactly one access point — the target BSSID
 * `ac:15:a2:1b:1c:a6` (see gat/constants). This module owns a throttled
 * background scan loop and exposes a SYNCHRONOUS accessor, `getTargetRssi()`,
 * which the positioning tick reads once per observation row (mirroring the IMU
 * hook's `latest()`): no await on the hot path.
 *
 * Native module access follows the same lazy-require + try/catch contract as
 * the BLE stack so the app still loads under Expo Go (where the native WiFi
 * module is absent) — every entry point degrades to "AP absent" (-100) rather
 * than throwing. iOS cannot enumerate BSSIDs without special entitlements, so
 * in practice this only yields real data on Android; elsewhere v1/v2 fall back
 * to the missing-AP defaults and callers should prefer `without_wifi`.
 *
 * Android throttles `loadWifiList` to ~4 scans / 2 min (API 28+); we prefer
 * `reScanAndLoadWifiList` for a fresh scan and rate-limit ourselves so we never
 * spin against the OS cap. Each successful scan updates the cached level to the
 * target AP's reading, or to -100 when the AP is not present in that scan.
 */
import { WIFI_ABSENT_RSSI, WIFI_BSSID } from "@/features/positioning/gat/constants";

// ── Lazy native module loader (Expo-Go safe) ──
let _wifiManager: any = null;
let _wifiUnavailable = false;

function getWifiManager(): any {
  if (_wifiUnavailable) return null;
  if (_wifiManager) return _wifiManager;
  try {
    const mod = require("react-native-wifi-reborn");
    _wifiManager = mod?.default ?? mod;
    return _wifiManager;
  } catch (e) {
    _wifiUnavailable = true;
    console.warn("[WiFi] react-native-wifi-reborn unavailable", e);
    return null;
  }
}

/** True when the native WiFi module resolved (still platform-gated at scan time). */
export function isWifiAvailable(): boolean {
  return getWifiManager() != null;
}

// ── Scan state ──
/** Default cadence for the background scan loop (ms). Kept above Android's ~30 s throttle window. */
const DEFAULT_SCAN_INTERVAL_MS = 8000;
/** Self-imposed floor between scans so we never hammer the OS cap. */
const MIN_SCAN_INTERVAL_MS = 6000;

const targetBssid = WIFI_BSSID.toLowerCase();

let cachedRssi = WIFI_ABSENT_RSSI;
let lastScanAt = 0;
let scanTimer: ReturnType<typeof setInterval> | null = null;
let scanning = false;

/**
 * Run one WiFi scan and update `cachedRssi` to the target AP's level (or
 * WIFI_ABSENT_RSSI when the AP is not in the result). Self-throttled; returns
 * the (possibly unchanged) cached level. Never throws.
 */
export async function scanOnce(): Promise<number> {
  const wm = getWifiManager();
  if (!wm) return cachedRssi;

  const scanFn = wm.reScanAndLoadWifiList ?? wm.loadWifiList;
  if (typeof scanFn !== "function") return cachedRssi;

  const now = Date.now();
  if (now - lastScanAt < MIN_SCAN_INTERVAL_MS) return cachedRssi;
  lastScanAt = now;

  try {
    const list = await scanFn.call(wm);
    let found = WIFI_ABSENT_RSSI;
    for (const ap of list ?? []) {
      const bssid = String(ap?.BSSID ?? ap?.bssid ?? "").toLowerCase();
      if (bssid === targetBssid) {
        const level = typeof ap?.level === "number" ? ap.level : Number(ap?.level);
        if (Number.isFinite(level)) found = level;
        break;
      }
    }
    cachedRssi = found;
  } catch (e: any) {
    console.warn("[WiFi] scan failed:", e?.message ?? e);
    // Keep the previous cached value on a transient failure (throttle / perms).
  }
  return cachedRssi;
}

/**
 * Begin the background scan loop. Fires one scan immediately, then every
 * `intervalMs`. Idempotent — a second call while already scanning is a no-op.
 */
export function startWifiScanning(intervalMs = DEFAULT_SCAN_INTERVAL_MS): void {
  if (scanning) return;
  if (!isWifiAvailable()) return;
  scanning = true;
  void scanOnce();
  scanTimer = setInterval(() => void scanOnce(), Math.max(intervalMs, MIN_SCAN_INTERVAL_MS));
}

/** Stop the scan loop and reset the cached reading to "absent". */
export function stopWifiScanning(): void {
  scanning = false;
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  cachedRssi = WIFI_ABSENT_RSSI;
  lastScanAt = 0;
}

/**
 * Synchronous accessor for the latest target-AP level (dBm). Returns
 * WIFI_ABSENT_RSSI (-100) when not scanning, the module is unavailable, or the
 * AP was not seen in the most recent scan — exactly the value the WiFi feature
 * block treats as "AP absent".
 */
export function getTargetRssi(): number {
  return cachedRssi;
}
