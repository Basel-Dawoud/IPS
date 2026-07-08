/**
 * Turn a SMOOTHED cell path (see smooth.ts) into structured navigation steps.
 *
 * Directions are RELATIVE to the walking direction ("walk straight", "turn
 * left") rather than grid-absolute ("go right/up"), so they stay correct no
 * matter how the map is rotated on the phone. Assumes the grid is a top-down
 * view with row increasing "down" the image (y-down): a positive 2-D cross
 * product between consecutive legs is a clockwise = RIGHT turn.
 */
import { CELL_SIZE, ELEVATOR, cellAt, getGrid } from "./grid-data";
import type { PathCell } from "./pathfinder";

export interface NavStep {
  text: string;
  icon: string;          // Ionicons name
  distanceM: number;
  direction: "straight" | "left" | "right" | "stairs" | "arrive";
  /**
   * World-space bearing of the leg the user walks during this step, in degrees
   * (0 = +x/east, measured clockwise since the grid is y-down). The UI rotates
   * the direction arrow by `headingDeg + mapRotationDeg` so it points along the
   * drawn route on screen. Undefined for stairs / arrival.
   */
  headingDeg?: number;
  /** Floor + world coords (meters) where this step ends — drives auto-advance. */
  floorLevel: number;
  endXm: number;
  endYm: number;
}

/** Turns shallower than this merge into the running straight leg. */
const STRAIGHT_MAX_DEG = 30;
/** Legs shorter than this are corridor jogs — absorbed, never a "turn". */
const MIN_TURN_LEG_M = 1.0;
/** Steps shorter than this aren't worth announcing — dropped (unless it's the only leg). */
const MIN_STEP_M = 0.75;

interface Pt {
  f: number;
  x: number;
  y: number;
}

const fmt = (m: number): string => (m >= 10 ? `${Math.round(m)}m` : `${m.toFixed(1)}m`);

const iconFor = (d: NavStep["direction"]): string => {
  switch (d) {
    case "straight": return "arrow-up";
    case "left":     return "arrow-back";
    case "right":    return "arrow-forward";
    case "stairs":   return "swap-vertical";
    default:         return "flag";
  }
};

export function pathToSteps(path: PathCell[]): NavStep[] {
  if (path.length < 2) {
    const [f, r, c] = path[0] ?? [0, 0, 0];
    return [
      {
        text: "You are at your destination.",
        icon: "checkmark-circle",
        distanceM: 0,
        direction: "arrive",
        floorLevel: f,
        endXm: c * CELL_SIZE,
        endYm: r * CELL_SIZE,
      },
    ];
  }

  const pts: Pt[] = path.map(([f, r, c]) => ({ f, x: c * CELL_SIZE, y: r * CELL_SIZE }));
  const out: NavStep[] = [];

  let prev: Pt | null = null; // vertex before `cur` — gives the incoming leg direction
  let cur = pts[0];
  let dist = 0;
  let dirLabel: NavStep["direction"] = "straight";
  // Direction of the most recent leg folded into the current step — its bearing
  // is the step's on-screen heading (steps are ~collinear between turns).
  let lastLegX = 0;
  let lastLegY = 0;

  const flush = (end: Pt) => {
    if (dist <= 0) return;
    if (dist < MIN_STEP_M && out.length > 0) return;
    const verb =
      dirLabel === "straight"
        ? out.length === 0
          ? "Walk straight"
          : "Continue straight"
        : `Turn ${dirLabel}, then walk`;
    const headingDeg =
      lastLegX !== 0 || lastLegY !== 0
        ? Math.atan2(lastLegY, lastLegX) * (180 / Math.PI)
        : undefined;
    out.push({
      text: `${verb} ${fmt(dist)}`,
      icon: iconFor(dirLabel),
      distanceM: dist,
      direction: dirLabel,
      headingDeg,
      floorLevel: end.f,
      endXm: end.x,
      endYm: end.y,
    });
  };

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];

    if (p.f !== cur.f) {
      flush(cur);
      // Label by the transition cell we're standing on (elevator vs stairs).
      const og = getGrid(cur.f);
      const viaElevator = og
        ? cellAt(og, Math.round(cur.y / CELL_SIZE), Math.round(cur.x / CELL_SIZE)) ===
          ELEVATOR
        : false;
      out.push({
        text: viaElevator
          ? `Take the elevator to floor ${p.f}`
          : `Take the stairs to floor ${p.f}`,
        icon: iconFor("stairs"),
        distanceM: 0,
        direction: "stairs",
        floorLevel: p.f,
        endXm: p.x,
        endYm: p.y,
      });
      prev = null;
      dist = 0;
      dirLabel = "straight";
      cur = p;
      continue;
    }

    const legX = p.x - cur.x;
    const legY = p.y - cur.y;
    const leg = Math.hypot(legX, legY);
    if (leg === 0) continue;

    if (prev && leg >= MIN_TURN_LEG_M) {
      const v1x = cur.x - prev.x;
      const v1y = cur.y - prev.y;
      const cross = v1x * legY - v1y * legX;
      const dot = v1x * legX + v1y * legY;
      const angleDeg = Math.abs(Math.atan2(cross, dot)) * (180 / Math.PI);
      if (angleDeg >= STRAIGHT_MAX_DEG) {
        flush(cur);
        dirLabel = cross > 0 ? "right" : "left";
        dist = 0;
      }
    }

    dist += leg;
    lastLegX = legX;
    lastLegY = legY;
    prev = cur;
    cur = p;
  }

  flush(cur);
  const last = pts[pts.length - 1];
  out.push({
    text: "You have arrived!",
    icon: iconFor("arrive"),
    distanceM: 0,
    direction: "arrive",
    floorLevel: last.f,
    endXm: last.x,
    endYm: last.y,
  });
  return out;
}

/** Legacy helper: returns the old single-string format for backward compat. */
export function pathToInstructions(path: PathCell[]): string {
  return pathToSteps(path).map((s) => s.text).join(". ");
}
