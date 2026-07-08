/**
 * On-device pathfinding entry point. Converts world metres → grid cells, snaps
 * to walkable cells, runs A*, and returns simplified waypoints (turn points) in
 * METER coords plus human-readable instructions.
 *
 * Coordinate convention (matches the POI seed + positioning):
 *   x = along the corridor (grid col), y = cross-corridor (grid row).
 */
import { CELL_SIZE, FLOOR_LEVELS, getGrid } from "./grid-data";
import { findNearestWalkable } from "./grid-manager";
import { findPath, findReachableGoal } from "./pathfinder";
import { smoothPath } from "./smooth";
import { pathToInstructions, pathToSteps, type NavStep } from "./instructions";
import type { Poi } from "../poi/types";

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
  blockedPoiIds?: string[];
  allPois?: Poi[];
}

export interface RouteResult {
  waypoints: RouteWaypoint[];
  instructions: string;
  steps: NavStep[];
  distanceM: number;
}

export function findRoute(req: RouteRequest): RouteResult | null {
  const sg = getGrid(req.startFloor);
  const eg = getGrid(req.endFloor);
  if (!sg || !eg) return null;

  // world (x = col, y = row) → cell, snapped to nearest walkable.
  const [sr, sc] = findNearestWalkable(sg, req.startYm / CELL_SIZE, req.startXm / CELL_SIZE);
  const [er, ec] = findNearestWalkable(eg, req.endYm / CELL_SIZE, req.endXm / CELL_SIZE);

  const blockedCells = new Set<string>();
  if (req.blockedPoiIds && req.allPois) {
    for (const bId of req.blockedPoiIds) {
      const p = req.allPois.find((poi) => poi.id === bId);
      if (p) {
        const pr = Math.round(p.y / CELL_SIZE);
        const pc = Math.round(p.x / CELL_SIZE);
        const pf = p.floorLevel;
        // Block a small cell radius around the POI to ensure users don't step into it
        const radius = 4;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            blockedCells.add(`${pf},${pr + dr},${pc + dc}`);
          }
        }
      }
    }
  }

  const opts = { stepFree: req.stepFree, blockedCells };
  let full = findPath([req.startFloor, sr, sc], [req.endFloor, er, ec], opts);
  if (!full) {
    // Goal walled off from the start's region (some grids seal the shop
    // interiors) → route to the nearest reachable cell: the storefront.
    const alt = findReachableGoal([req.startFloor, sr, sc], [req.endFloor, er, ec], opts);
    full = alt ? findPath([req.startFloor, sr, sc], alt, opts) : null;
    if (!full) return null;
  }

  // Line-of-sight smoothing collapses the 4-connected A* staircase into a few
  // straight legs — clean polyline AND clean instructions.
  const path = smoothPath(full);
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

  return { waypoints, instructions: pathToInstructions(path), steps: pathToSteps(path), distanceM };
}

export { CELL_SIZE, FLOOR_LEVELS, getGrid } from "./grid-data";
