/**
 * IPS heatmap color ramp, ported from IPS-main dashboard/index.html:
 * 4 stops green → teal → amber → red, interpolated by intensity 0..1.
 */
const STOPS: [number, number, number][] = [
  [45, 212, 167], // green  #2DD4A7
  [20, 184, 166], // teal   #14B8A6
  [242, 163, 60], // amber  #F2A33C
  [239, 68, 68], // red    #EF4444
];

export function heatColor(intensity: number): string {
  const i = Math.min(1, Math.max(0, intensity));
  const pos = i * (STOPS.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(STOPS.length - 1, lo + 1);
  const t = pos - lo;
  const c = STOPS[lo].map((v, k) => Math.round(v + (STOPS[hi][k] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Fill alpha for a heat rect (ported: 0.15 + intensity * 0.35). */
export function heatAlpha(intensity: number): number {
  return 0.15 + Math.min(1, Math.max(0, intensity)) * 0.35;
}

export const WALKING_COLOR = "#2DD4A7";
export const STATIONARY_COLOR = "#F2A33C";
