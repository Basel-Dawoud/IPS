export const RSSI_MIN = -120;
export const SCAN_MODE_LOW_LATENCY = 2;

// Watchdog: restart scan if no advertisements arrive for a while (Android can
// silently stall after a few minutes). Throttled so we stay below Android's
// 5-scan-starts-per-30s limit.
export const STALL_THRESHOLD_MS = 3500;
export const MIN_RESTART_INTERVAL_MS = 10_000;

export const DISCOVERED_NOTIFY_THROTTLE_MS = 100;
