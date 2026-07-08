/**
 * Monotonic clock + UUID helpers for trajectory replay fidelity (B1/B6).
 *
 * `nowMonoMs()` returns a millisecond timestamp from a monotonic source when
 * available (`performance.now()`), falling back to `Date.now()`. Unlike the wall
 * clock, a monotonic clock never jumps backwards (NTP correction, user changing
 * the time) mid-walk — so relative deltas (`tMs`) stay faithful to real sensor
 * cadence. We only anchor the walk onto the calendar once, via `Date.now()` at
 * walk start (`clockEpochMs`); every per-sample time is `nowMonoMs() - t0Mono`.
 *
 * `performance.now()` is origin-relative and not comparable across JS contexts,
 * which is exactly why we subtract a per-walk baseline rather than storing it raw.
 */
export function nowMonoMs(): number {
  const perf = (globalThis as any)?.performance;
  if (perf && typeof perf.now === "function") {
    return perf.now();
  }
  return Date.now();
}

/**
 * RFC-4122 v4 UUID. Prefers the platform crypto RNG; falls back to Math.random
 * (Expo Go has no expo-crypto guarantee). Used as a per-walk `clientId` so a
 * retried upload is de-duplicated server-side rather than creating a copy.
 */
export function randomUuid(): string {
  const c = (globalThis as any)?.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
