/**
 * Grid-derived POI areas. POIs are stored as points and the Adham grids carry
 * no room codes, so the shop footprint is recovered on-device: grow a
 * rectangle from the POI point, one edge at a time, until every edge hits a
 * wall (an edge only advances when its ENTIRE new strip is walkable, so door
 * gaps don't leak the rect into the corridor).
 *
 * Returns null when the floor has no bundled grid or the POI sits in open
 * space (both dimensions hit the cap) — callers fall back to a dot marker.
 */
import { CELL_SIZE, getGrid } from "./grid-data";
import { findNearestWalkable, isWalkable } from "./grid-manager";

export interface PoiAreaM {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cap per side so an open-space POI can't claim half the floor. */
const MAX_SIDE_M = 12;

export function computePoiArea(
  floorLevel: number,
  xM: number,
  yM: number,
): PoiAreaM | null {
  const g = getGrid(floorLevel);
  if (!g) return null;

  const [r0, c0] = findNearestWalkable(g, yM / CELL_SIZE, xM / CELL_SIZE);
  const maxCells = Math.round(MAX_SIDE_M / CELL_SIZE);

  const rowClear = (r: number, cA: number, cB: number): boolean => {
    if (r < 0 || r >= g.rows) return false;
    for (let c = cA; c <= cB; c++) if (!isWalkable(g, r, c)) return false;
    return true;
  };
  const colClear = (c: number, rA: number, rB: number): boolean => {
    if (c < 0 || c >= g.cols) return false;
    for (let r = rA; r <= rB; r++) if (!isWalkable(g, r, c)) return false;
    return true;
  };

  // Round-robin growth keeps the rect near full shop width before it reaches
  // the door row, so the whole edge can't slip through a narrow opening.
  let top = r0;
  let bottom = r0;
  let left = c0;
  let right = c0;
  let grew = true;
  while (grew) {
    grew = false;
    if (bottom - top + 1 < maxCells) {
      if (rowClear(top - 1, left, right)) {
        top--;
        grew = true;
      }
      if (bottom - top + 1 < maxCells && rowClear(bottom + 1, left, right)) {
        bottom++;
        grew = true;
      }
    }
    if (right - left + 1 < maxCells) {
      if (colClear(left - 1, top, bottom)) {
        left--;
        grew = true;
      }
      if (right - left + 1 < maxCells && colClear(right + 1, top, bottom)) {
        right++;
        grew = true;
      }
    }
  }

  const wCells = right - left + 1;
  const hCells = bottom - top + 1;
  // Hitting the cap in either dimension means the rect ran into open space
  // (corridor/kiosk) instead of shop walls — no area, use a dot marker.
  // (Genuinely >12 m-wide shops also fall back; the planned admin-drawn
  // override is the fix for those.)
  if (wCells >= maxCells || hCells >= maxCells) return null;

  return {
    x: left * CELL_SIZE,
    y: top * CELL_SIZE,
    w: wCells * CELL_SIZE,
    h: hCells * CELL_SIZE,
  };
}
