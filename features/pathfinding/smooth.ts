/**
 * Line-of-sight path smoothing ("string pulling"). The A* path is 4-connected,
 * so any diagonal leg comes out as a staircase of 0.2 m zigzags — which then
 * turns into dozens of tiny "go right 0.2m / go up 0.4m" instructions. This
 * pass replaces each same-floor run with the fewest waypoints such that every
 * consecutive pair has walkable line-of-sight on the grid.
 */
import { FloorGrid, getGrid } from "./grid-data";
import { isWalkable } from "./grid-manager";
import type { PathCell } from "./pathfinder";

/**
 * Supercover Bresenham walkability check between two cells. Diagonal steps
 * require BOTH orthogonal neighbors to be walkable so the smoothed segment
 * can't graze through a wall corner.
 */
export function hasLineOfSight(
  g: FloorGrid,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
  isBlocked?: (r: number, c: number) => boolean,
): boolean {
  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1;
  const sc = c0 < c1 ? 1 : -1;
  let err = dc - dr;
  let r = r0;
  let c = c0;

  const passable = (rr: number, cc: number) =>
    isWalkable(g, rr, cc) && !isBlocked?.(rr, cc);

  for (;;) {
    if (!passable(r, c)) return false;
    if (r === r1 && c === c1) return true;
    const e2 = 2 * err;
    const stepC = e2 > -dr;
    const stepR = e2 < dc;
    if (stepC && stepR && (!passable(r, c + sc) || !passable(r + sr, c))) {
      return false;
    }
    if (stepC) {
      err -= dr;
      c += sc;
    }
    if (stepR) {
      err += dc;
      r += sr;
    }
  }
}

// Greedy: from each anchor keep extending the segment while LOS holds.
function smoothRun(run: PathCell[], blockedCells?: Set<string>): PathCell[] {
  if (run.length <= 2) return run;
  const floor = run[0][0];
  const g = getGrid(floor);
  if (!g) return run;

  // A leg may not graze a blocked (but grid-walkable) cell — e.g. an
  // emergency-blocked staircase the A* already detoured around.
  const isBlocked =
    blockedCells && blockedCells.size > 0
      ? (r: number, c: number) => blockedCells.has(`${floor},${r},${c}`)
      : undefined;

  const out: PathCell[] = [run[0]];
  let a = 0;
  while (a < run.length - 1) {
    let j = a + 1;
    while (
      j + 1 < run.length &&
      hasLineOfSight(g, run[a][1], run[a][2], run[j + 1][1], run[j + 1][2], isBlocked)
    ) {
      j++;
    }
    out.push(run[j]);
    a = j;
  }
  return out;
}

/** Smooth each same-floor run; floor-change transitions are kept as-is. */
export function smoothPath(full: PathCell[], blockedCells?: Set<string>): PathCell[] {
  if (full.length <= 2) return full;
  const out: PathCell[] = [];
  let runStart = 0;
  for (let i = 1; i <= full.length; i++) {
    if (i === full.length || full[i][0] !== full[runStart][0]) {
      out.push(...smoothRun(full.slice(runStart, i), blockedCells));
      runStart = i;
    }
  }
  return out;
}
