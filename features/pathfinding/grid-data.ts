/**
 * Bundled per-floor occupancy grids for on-device pathfinding (ported from
 * IPS-Adham-Smart-Mall). Cell codes: 0 free, 1 wall, 2 stairs, 3 elevator
 * (5 room / 6 corridor may appear in richer grids). One pixel = one cell =
 * CELL_SIZE metres. Grid is row-major `[row][col]`; world `x = col*CELL_SIZE`
 * (along corridor), `y = row*CELL_SIZE` (cross corridor) — matches the POI seed.
 */
import floor3 from "../../assets/grids/floor-3.json";
import floor4 from "../../assets/grids/floor-4.json";

export const CELL_SIZE = 0.2;

// Cell codes.
export const FREE = 0;
export const WALL = 1;
export const STAIRS = 2;
export const ELEVATOR = 3;

export interface FloorGrid {
  level: number;
  rows: number;
  cols: number;
  cellSize: number;
  cells: Uint8Array;
}

interface RawGrid {
  level: number;
  rows: number;
  cols: number;
  cellSize: number;
  data: number[];
}

function build(raw: RawGrid): FloorGrid {
  return {
    level: raw.level,
    rows: raw.rows,
    cols: raw.cols,
    cellSize: raw.cellSize ?? CELL_SIZE,
    cells: Uint8Array.from(raw.data),
  };
}

const GRIDS: Record<number, FloorGrid> = {
  3: build(floor3 as RawGrid),
  4: build(floor4 as RawGrid),
};

export const FLOOR_LEVELS: number[] = Object.keys(GRIDS)
  .map(Number)
  .sort((a, b) => a - b);

export function getGrid(level: number): FloorGrid | null {
  return GRIDS[level] ?? null;
}

export function cellAt(g: FloorGrid, r: number, c: number): number {
  return g.cells[r * g.cols + c];
}

export function inBounds(g: FloorGrid, r: number, c: number): boolean {
  return r >= 0 && r < g.rows && c >= 0 && c < g.cols;
}

/** Index of a floor level for the A* floor-change heuristic penalty. */
export function floorIndex(level: number): number {
  const i = FLOOR_LEVELS.indexOf(level);
  return i < 0 ? 0 : i;
}

/**
 * Representative ELEVATOR cell ("hub") per floor. The bundled floor-3/floor-4
 * grids were traced independently, so their elevator regions do NOT share the
 * same (row,col) — the naive same-cell floor hop only works for stairs. To make
 * elevator floor-changes work we treat each floor's elevator region as one
 * shaft and pick its centroid (snapped to a real elevator cell) as the hub;
 * the pathfinder links hubs across floors as a vertical portal.
 */
const ELEVATOR_HUBS: Record<number, [row: number, col: number] | null> = {};

export function elevatorHub(level: number): [number, number] | null {
  if (level in ELEVATOR_HUBS) return ELEVATOR_HUBS[level];
  const g = getGrid(level);
  let hub: [number, number] | null = null;
  if (g) {
    let sumR = 0;
    let sumC = 0;
    let n = 0;
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (cellAt(g, r, c) === ELEVATOR) {
          sumR += r;
          sumC += c;
          n++;
        }
      }
    }
    if (n > 0) {
      const cr = sumR / n;
      const cc = sumC / n;
      // Snap the centroid to the nearest actual elevator cell.
      let best = Infinity;
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          if (cellAt(g, r, c) !== ELEVATOR) continue;
          const d = (r - cr) ** 2 + (c - cc) ** 2;
          if (d < best) {
            best = d;
            hub = [r, c];
          }
        }
      }
    }
  }
  ELEVATOR_HUBS[level] = hub;
  return hub;
}
