/**
 * A* over the multi-floor occupancy grid (port of pathfinder.py). Nodes are
 * `[floorLevel, row, col]`. 4-connected within a floor; stair/elevator cells
 * allow a same-(row,col) transition to the other floor. Default "Normal" cost
 * model (1 per step, a fixed penalty per floor change).
 */
import {
  ELEVATOR,
  FLOOR_LEVELS,
  FloorGrid,
  STAIRS,
  cellAt,
  elevatorHub,
  floorIndex,
  getGrid,
  inBounds,
} from "./grid-data";
import { isWalkable } from "./grid-manager";

export type PathCell = [floorLevel: number, row: number, col: number];

/** Routing options. `stepFree` bans stair floor-changes (accessibility). */
export interface PathOptions {
  stepFree?: boolean;
  blockedCells?: Set<string>;
}

const FLOOR_CHANGE_COST = 15;

function key(f: number, r: number, c: number): string {
  return `${f},${r},${c}`;
}

function heuristic(a: PathCell, b: PathCell): number {
  return (
    Math.abs(a[1] - b[1]) +
    Math.abs(a[2] - b[2]) +
    Math.abs(floorIndex(a[0]) - floorIndex(b[0])) * 10
  );
}

// Binary min-heap keyed by f-score.
class MinHeap<T> {
  private a: { k: number; v: T }[] = [];
  get size(): number {
    return this.a.length;
  }
  push(k: number, v: T): void {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < a.length && a[l].k < a[s].k) s = l;
        if (r < a.length && a[r].k < a[s].k) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top.v;
  }
}

function neighbors(node: PathCell, opts?: PathOptions): { next: PathCell; cost: number }[] {
  const [f, r, c] = node;
  const g = getGrid(f) as FloorGrid;
  const out: { next: PathCell; cost: number }[] = [];

  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(g, nr, nc) && isWalkable(g, nr, nc)) {
      if (!opts?.blockedCells?.has(key(f, nr, nc))) {
        out.push({ next: [f, nr, nc], cost: 1 });
      }
    }
  }

  const here = cellAt(g, r, c);

  // Stairs: hop to the same (row, col) on another floor (the bundled grids align
  // stairs cell-for-cell). Banned for step-free routing.
  if (here === STAIRS && !opts?.stepFree) {
    for (const other of FLOOR_LEVELS) {
      if (other === f) continue;
      const og = getGrid(other);
      if (!og || !inBounds(og, r, c)) continue;
      if (cellAt(og, r, c) === STAIRS) {
        if (!opts?.blockedCells?.has(key(other, r, c)) && !opts?.blockedCells?.has(key(f, r, c))) {
          out.push({ next: [other, r, c], cost: FLOOR_CHANGE_COST });
        }
      }
    }
  }

  // Elevator: the regions do NOT align across floors, so link this floor's
  // elevator to the other floor's elevator hub as a vertical portal.
  if (here === ELEVATOR) {
    for (const other of FLOOR_LEVELS) {
      if (other === f) continue;
      const hub = elevatorHub(other);
      if (hub) {
        if (!opts?.blockedCells?.has(key(other, hub[0], hub[1])) && !opts?.blockedCells?.has(key(f, r, c))) {
          out.push({ next: [other, hub[0], hub[1]], cost: FLOOR_CHANGE_COST });
        }
      }
    }
  }

  return out;
}

/**
 * BFS the whole region reachable from `start` (across floors via stair hops)
 * and return the reachable cell nearest to `goal` on the goal's floor. Used
 * when the goal itself is walled off (e.g. floor-4 shops are sealed in the
 * grid) — routing then targets the storefront instead of failing.
 */
export function findReachableGoal(
  start: PathCell,
  goal: PathCell,
  opts?: PathOptions,
): PathCell | null {
  const seen = new Set<string>([key(...start)]);
  const queue: PathCell[] = [start];
  let best: PathCell | null = null;
  let bestD = Infinity;
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur[0] === goal[0]) {
      const d = (cur[1] - goal[1]) ** 2 + (cur[2] - goal[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = cur;
        if (d === 0) return cur;
      }
    }
    for (const { next } of neighbors(cur, opts)) {
      const nk = key(...next);
      if (!seen.has(nk)) {
        seen.add(nk);
        queue.push(next);
      }
    }
  }
  return best;
}

export function findPath(
  start: PathCell,
  goal: PathCell,
  opts?: PathOptions,
): PathCell[] | null {
  const open = new MinHeap<PathCell>();
  open.push(0, start);
  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, PathCell>();
  gScore.set(key(...start), 0);
  const goalKey = key(...goal);

  while (open.size > 0) {
    const current = open.pop()!;
    const ck = key(...current);
    if (ck === goalKey) {
      const path: PathCell[] = [current];
      let cur = ck;
      while (cameFrom.has(cur)) {
        const prev = cameFrom.get(cur)!;
        path.unshift(prev);
        cur = key(...prev);
      }
      return path;
    }
    const curG = gScore.get(ck)!;
    for (const { next, cost } of neighbors(current, opts)) {
      const nk = key(...next);
      const tentative = curG + cost;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, current);
        open.push(tentative + heuristic(next, goal), next);
      }
    }
  }
  return null;
}
