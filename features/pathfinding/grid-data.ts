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
