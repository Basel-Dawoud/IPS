/**
 * A* over the multi-floor occupancy grid (port of pathfinder.py). Nodes are
 * `[floorLevel, row, col]`. 4-connected within a floor. Floor changes are
 * POI-driven: STAIRS/ELEVATOR POIs are materialized into a portal graph (see
 * index.ts) that links a portal cell to its matched counterpart on other floors.
 * Default "Normal" cost model (1 per step, a fixed penalty per floor change).
 */
import { FloorGrid, floorIndex, getGrid, inBounds } from "./grid-data";
import { isWalkable } from "./grid-manager";

export type PathCell = [floorLevel: number, row: number, col: number];

/** One floor-change edge from a portal cell to its matched portal on another floor. */
export interface PortalEdge {
  next: PathCell;
  type: "STAIRS" | "ELEVATOR";
}

/** Portal cell key (`${floor},${row},${col}`) → outgoing floor-change edges. */
export type PortalGraph = Map<string, PortalEdge[]>;

/** Routing options. `stepFree` bans stair floor-changes (accessibility). */
export interface PathOptions {
  stepFree?: boolean;
  blockedCells?: Set<string>;
  portals?: PortalGraph;
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

  // POI-driven floor changes: standing on a portal cell links to its matched
  // portal(s) on other floors. Step-free routing bans stairs; blocked target
  // cells (emergency zones) are skipped.
  const portalEdges = opts?.portals?.get(key(f, r, c));
  if (portalEdges) {
    for (const e of portalEdges) {
      if (opts?.stepFree && e.type === "STAIRS") continue;
      const [tf, tr, tc] = e.next;
      if (opts?.blockedCells?.has(key(tf, tr, tc))) continue;
      out.push({ next: e.next, cost: FLOOR_CHANGE_COST });
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
