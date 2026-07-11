/**
 * Auto-derived POI zones (shop footprints) for the dashboard preview — a port
 * of the app's grid growth (navimind/features/pathfinding/poi-area.ts) but
 * sourced from the floor's vectorMap: the wall rects are rasterized back into
 * a cell grid, then a rectangle grows from the POI point until every edge hits
 * a wall. An edge only advances when its ENTIRE new strip is wall-free, so
 * door gaps don't leak the rect into the corridor.
 *
 * Returns null for open-space POIs (the rect hit the 12 m/side cap in either
 * dimension) or when there's no vectorMap — those render as plain dots, and
 * the admin can draw a zone manually instead.
 */
import type { VectorMap } from "@/features/floors/types";

export interface PoiZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_SIDE_M = 12;

interface WallGrid {
  rows: number;
  cols: number;
  cell: number;
  /** 1 = wall, 0 = free. */
  walls: Uint8Array;
}

const gridCache = new WeakMap<VectorMap, WallGrid>();

function rasterizeWalls(vm: VectorMap): WallGrid {
  const cached = gridCache.get(vm);
  if (cached) return cached;

  const cell = vm.cellSize || 0.2;
  const rows = Math.max(1, Math.round(vm.heightM / cell));
  const cols = Math.max(1, Math.round(vm.widthM / cell));
  const walls = new Uint8Array(rows * cols);
  for (const r of vm.walls) {
    const r0 = Math.max(0, Math.floor(r.y / cell));
    const r1 = Math.min(rows - 1, Math.ceil((r.y + r.h) / cell) - 1);
    const c0 = Math.max(0, Math.floor(r.x / cell));
    const c1 = Math.min(cols - 1, Math.ceil((r.x + r.w) / cell) - 1);
    for (let rr = r0; rr <= r1; rr++) {
      walls.fill(1, rr * cols + c0, rr * cols + c1 + 1);
    }
  }

  const grid = { rows, cols, cell, walls };
  gridCache.set(vm, grid);
  return grid;
}

export function computeAutoZone(
  vectorMap: VectorMap | null | undefined,
  xM: number,
  yM: number,
): PoiZone | null {
  if (!vectorMap) return null;
  const g = rasterizeWalls(vectorMap);
  const free = (r: number, c: number) =>
    r >= 0 && r < g.rows && c >= 0 && c < g.cols && g.walls[r * g.cols + c] === 0;

  let r0 = Math.max(0, Math.min(g.rows - 1, Math.round(yM / g.cell)));
  let c0 = Math.max(0, Math.min(g.cols - 1, Math.round(xM / g.cell)));
  // Nudge off a wall cell (POI placed on the wall line) — small ring search.
  if (!free(r0, c0)) {
    outer: for (let d = 1; d <= 5; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
          if (free(r0 + dr, c0 + dc)) {
            r0 += dr;
            c0 += dc;
            break outer;
          }
        }
      }
    }
    if (!free(r0, c0)) return null;
  }

  const maxCells = Math.round(MAX_SIDE_M / g.cell);
  const rowClear = (r: number, cA: number, cB: number) => {
    for (let c = cA; c <= cB; c++) if (!free(r, c)) return false;
    return true;
  };
  const colClear = (c: number, rA: number, rB: number) => {
    for (let r = rA; r <= rB; r++) if (!free(r, c)) return false;
    return true;
  };

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
  if (wCells >= maxCells || hCells >= maxCells) return null;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    x: round2(left * g.cell),
    y: round2(top * g.cell),
    w: round2(wCells * g.cell),
    h: round2(hCells * g.cell),
  };
}
