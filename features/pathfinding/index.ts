/**
 * On-device pathfinding entry point. Converts world metres → grid cells, snaps
 * to walkable cells, runs A*, and returns simplified waypoints (turn points) in
 * METER coords plus human-readable instructions.
 *
 * Coordinate convention (matches the POI seed + positioning):
 *   x = along the corridor (grid col), y = cross-corridor (grid row).
 */
import {
  CELL_SIZE,
  ELEVATOR,
  FLOOR_LEVELS,
  STAIRS,
  cellAt,
  getGrid,
  inBounds,
} from "./grid-data";
import { findNearestWalkable } from "./grid-manager";
import {
  findPath,
  findReachableGoal,
  type PortalEdge,
  type PortalGraph,
} from "./pathfinder";
import { smoothPath } from "./smooth";
import { pathToInstructions, pathToSteps, type NavStep } from "./instructions";
import type { Poi } from "../poi/types";
import type { BlockedZone } from "../emergency/use-emergency-alert";

type TransitionType = "STAIRS" | "ELEVATOR";

interface MaterializedPortal {
  id: string;
  type: TransitionType;
  floor: number;
  row: number;
  col: number;
}

/**
 * Turn STAIRS/ELEVATOR POIs into a portal graph: each portal links to the
 * NEAREST same-type portal on every other floor (shafts are vertically
 * aligned). Blocked POIs are dropped so an emergency-blocked stair/elevator
 * simply disappears from the routing graph. Also returns a cell→type lookup so
 * instructions can label "stairs" vs "elevator" without reading grid codes.
 */
function buildPortals(
  transitionPois: Poi[] | undefined,
  blockedPoiIds: string[] | undefined,
): { graph: PortalGraph; typeByCell: Map<string, TransitionType> } {
  const blocked = new Set(blockedPoiIds ?? []);
  const portals: MaterializedPortal[] = [];
  for (const p of transitionPois ?? []) {
    if (p.type !== "STAIRS" && p.type !== "ELEVATOR") continue;
    if (blocked.has(p.id)) continue;
    const g = getGrid(p.floorLevel);
    if (!g) continue;
    const [row, col] = findNearestWalkable(g, p.y / CELL_SIZE, p.x / CELL_SIZE);
    portals.push({ id: p.id, type: p.type, floor: p.floorLevel, row, col });
  }

  const graph: PortalGraph = new Map();
  const typeByCell = new Map<string, TransitionType>();
  for (const p of portals) typeByCell.set(`${p.floor},${p.row},${p.col}`, p.type);

  // A shaft/staircase is traversable BOTH ways, so every match is added as two
  // directed edges. Doing this from each portal's nearest match (union, not just
  // p→nearest) keeps floor changes reachable even when stairs/elevators don't
  // line up 1:1 across floors — otherwise you could go down at one staircase but
  // never come back up at another, stranding a same-floor detour.
  const addEdge = (from: MaterializedPortal, to: MaterializedPortal) => {
    const k = `${from.floor},${from.row},${from.col}`;
    const arr = graph.get(k) ?? [];
    if (!arr.some((e) => e.next[0] === to.floor && e.next[1] === to.row && e.next[2] === to.col)) {
      arr.push({ next: [to.floor, to.row, to.col], type: from.type });
      graph.set(k, arr);
    }
  };

  for (const p of portals) {
    // Nearest same-type portal per other floor.
    const bestPerFloor = new Map<number, MaterializedPortal>();
    for (const q of portals) {
      if (q.type !== p.type || q.floor === p.floor) continue;
      const best = bestPerFloor.get(q.floor);
      const d = (q.row - p.row) ** 2 + (q.col - p.col) ** 2;
      const bd = best ? (best.row - p.row) ** 2 + (best.col - p.col) ** 2 : Infinity;
      if (d < bd) bestPerFloor.set(q.floor, q);
    }
    for (const q of bestPerFloor.values()) {
      addEdge(p, q);
      addEdge(q, p); // symmetric: whatever goes down must come back up
    }
  }
  return { graph, typeByCell };
}

/**
 * Cells to seal off for emergency-blocked STAIRS/ELEVATOR POIs. Dropping the
 * portal (see buildPortals) only stops FLOOR CHANGES through them — the grid
 * cells stay walkable, so a same-floor route would still cross the blocked
 * staircase. To make "not accessible" mean truly impassable we also mark the
 * footprint as blocked: the contiguous stairs/elevator grid region around the
 * POI, plus any admin-drawn area rect (radius fallback if neither is found).
 */
function blockedFootprintCells(
  transitionPois: Poi[] | undefined,
  blockedPoiIds: string[] | undefined,
): Set<string> {
  const cells = new Set<string>();
  const blocked = new Set(blockedPoiIds ?? []);
  if (blocked.size === 0) return cells;

  for (const p of transitionPois ?? []) {
    if (!blocked.has(p.id)) continue;
    const g = getGrid(p.floorLevel);
    if (!g) continue;
    const [r0, c0] = findNearestWalkable(g, p.y / CELL_SIZE, p.x / CELL_SIZE);
    let sealed = 0;

    // Flood the contiguous stairs/elevator region so the whole shaft is sealed.
    const code = cellAt(g, r0, c0);
    if (code === STAIRS || code === ELEVATOR) {
      const seen = new Set<string>([`${r0},${c0}`]);
      const queue: [number, number][] = [[r0, c0]];
      while (queue.length) {
        const [r, c] = queue.shift()!;
        cells.add(`${p.floorLevel},${r},${c}`);
        sealed++;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nr = r + dr;
          const nc = c + dc;
          const k = `${nr},${nc}`;
          if (!seen.has(k) && inBounds(g, nr, nc) && cellAt(g, nr, nc) === code) {
            seen.add(k);
            queue.push([nr, nc]);
          }
        }
      }
    }

    // Admin-drawn footprint rect (auto-created POIs have none → falls through).
    if (p.areaX != null && p.areaY != null && p.areaW != null && p.areaH != null) {
      const bc0 = Math.floor(p.areaX / CELL_SIZE);
      const bc1 = Math.ceil((p.areaX + p.areaW) / CELL_SIZE);
      const br0 = Math.floor(p.areaY / CELL_SIZE);
      const br1 = Math.ceil((p.areaY + p.areaH) / CELL_SIZE);
      for (let r = br0; r <= br1; r++) {
        for (let c = bc0; c <= bc1; c++) cells.add(`${p.floorLevel},${r},${c}`);
      }
      sealed++;
    }

    // Fallback: never leave a blocked POI walkable — seal a small radius box.
    if (sealed === 0) {
      const radius = 4;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          cells.add(`${p.floorLevel},${r0 + dr},${c0 + dc}`);
        }
      }
    }
  }
  return cells;
}

export interface RouteWaypoint {
  x: number;
  y: number;
  floorLevel: number;
}

export interface RouteRequest {
  startFloor: number;
  startXm: number;
  startYm: number;
  endFloor: number;
  endXm: number;
  endYm: number;
  /** When true, route via elevators only (no stairs) — accessibility preference. */
  stepFree?: boolean;
  /** STAIRS/ELEVATOR POIs that drive cross-floor transitions (required for multi-floor routes). */
  transitionPois?: Poi[];
  /** Emergency-blocked POI ids (stairs/elevators removed from the portal graph). */
  blockedPoiIds?: string[];
  /** Emergency-blocked areas (meter rectangles) the route must avoid. */
  blockedZones?: BlockedZone[];
}

export interface RouteResult {
  waypoints: RouteWaypoint[];
  instructions: string;
  steps: NavStep[];
  distanceM: number;
}

/** Toggle verbose routing logs (set false to silence). */
export const ROUTE_DEBUG = true;
const rlog = (...a: unknown[]) => {
  if (ROUTE_DEBUG) console.log("[route]", ...a);
};
const floorSeq = (pts: { floorLevel: number }[]) =>
  pts.map((p) => p.floorLevel).filter((f, i, arr) => i === 0 || f !== arr[i - 1]).join("→");

export function findRoute(req: RouteRequest): RouteResult | null {
  const sg = getGrid(req.startFloor);
  const eg = getGrid(req.endFloor);
  if (!sg || !eg) {
    rlog("ABORT no grid for", { startFloor: req.startFloor, endFloor: req.endFloor, haveStart: !!sg, haveEnd: !!eg });
    return null;
  }

  // world (x = col, y = row) → cell, snapped to nearest walkable.
  const [sr, sc] = findNearestWalkable(sg, req.startYm / CELL_SIZE, req.startXm / CELL_SIZE);
  const [er, ec] = findNearestWalkable(eg, req.endYm / CELL_SIZE, req.endXm / CELL_SIZE);

  rlog("REQUEST", {
    start: `f${req.startFloor} (${req.startXm.toFixed(1)},${req.startYm.toFixed(1)}) →cell[${sr},${sc}]`,
    end: `f${req.endFloor} (${req.endXm.toFixed(1)},${req.endYm.toFixed(1)}) →cell[${er},${ec}]`,
    stepFree: !!req.stepFree,
    transitionPois: (req.transitionPois ?? []).map((p) => `${p.type[0]}:${p.id.slice(-4)}@f${p.floorLevel}(${p.x.toFixed(1)},${p.y.toFixed(1)})`),
    blockedPoiIds: req.blockedPoiIds ?? [],
    blockedZones: (req.blockedZones ?? []).length,
  });

  // Emergency-blocked areas → impassable cells. Blocked stairs/elevators are
  // BOTH dropped as portals (no floor change, see buildPortals) AND sealed as
  // footprints here (no walking through them on the same floor).
  const blockedCells = blockedFootprintCells(req.transitionPois, req.blockedPoiIds);
  for (const z of req.blockedZones ?? []) {
    const c0 = Math.floor(z.x / CELL_SIZE);
    const c1 = Math.ceil((z.x + z.w) / CELL_SIZE);
    const r0 = Math.floor(z.y / CELL_SIZE);
    const r1 = Math.ceil((z.y + z.h) / CELL_SIZE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) blockedCells.add(`${z.floorLevel},${r},${c}`);
    }
  }

  const { graph: portals, typeByCell } = buildPortals(req.transitionPois, req.blockedPoiIds);

  // Log the portal graph: which transition cells link to which (floor changes).
  const portalDump: string[] = [];
  for (const [from, edges] of portals) {
    for (const e of edges) portalDump.push(`${from}(${typeByCell.get(from) ?? "?"})→${e.next.join(",")}`);
  }
  rlog("PORTALS", { portalCells: portals.size, blockedCells: blockedCells.size, edges: portalDump });

  const opts = { stepFree: req.stepFree, blockedCells, portals };
  let full = findPath([req.startFloor, sr, sc], [req.endFloor, er, ec], opts);
  rlog("findPath", full ? `OK floors ${floorSeq(full.map((p) => ({ floorLevel: p[0] })))} (${full.length} cells)` : "NULL (no direct/detour path)");
  if (!full) {
    // The multi-floor A* already explores stair/elevator detours, so reaching
    // here means the goal is genuinely unreachable. When emergency blocking is
    // active (a zone/POI cut it off), return null so the caller can pick another
    // exit or a way down — NOT a misleading path to some far reachable cell.
    if (blockedCells.size > 0) {
      rlog("RESULT null — emergency blocking active & goal unreachable (caller should try another exit)");
      return null;
    }
    // Normal navigation: goal walled off from the start's region (some grids
    // seal the shop interiors) → route to the nearest reachable cell (storefront).
    const alt = findReachableGoal([req.startFloor, sr, sc], [req.endFloor, er, ec], opts);
    rlog("fallback findReachableGoal", alt ? `→ cell[${alt[1]},${alt[2]}]@f${alt[0]}` : "NULL");
    full = alt ? findPath([req.startFloor, sr, sc], alt, opts) : null;
    if (!full) {
      rlog("RESULT null — no reachable goal even via storefront fallback");
      return null;
    }
  }

  // Line-of-sight smoothing collapses the 4-connected A* staircase into a few
  // straight legs — clean polyline AND clean instructions.
  const path = smoothPath(full, blockedCells);
  const waypoints: RouteWaypoint[] = path.map(([fl, r, c]) => ({
    x: c * CELL_SIZE,
    y: r * CELL_SIZE,
    floorLevel: fl,
  }));

  let distanceM = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    if (a.floorLevel === b.floorLevel) distanceM += Math.hypot(b.x - a.x, b.y - a.y);
  }

  rlog("RESULT ok", {
    floors: floorSeq(waypoints),
    waypoints: waypoints.length,
    distanceM: Math.round(distanceM),
    end: `f${waypoints.at(-1)?.floorLevel} (${waypoints.at(-1)?.x.toFixed(1)},${waypoints.at(-1)?.y.toFixed(1)})`,
  });

  return {
    waypoints,
    instructions: pathToInstructions(path, typeByCell),
    steps: pathToSteps(path, typeByCell),
    distanceM,
  };
}

export { CELL_SIZE, FLOOR_LEVELS, getGrid } from "./grid-data";
