/**
 * Grid helpers ported from grid_manager.py: snap a world point to the nearest
 * walkable cell. (Walkable = anything that is not a wall.)
 */
import { FloorGrid, WALL, cellAt, inBounds } from "./grid-data";

export function isWalkable(g: FloorGrid, r: number, c: number): boolean {
  return inBounds(g, r, c) && cellAt(g, r, c) !== WALL;
}

/**
 * Nearest walkable cell to (r, c) via BFS. Mirrors `find_nearest_free` but snaps
 * to any non-wall cell (these grids don't encode room interiors). Clamps the
 * input into bounds first.
 */
export function findNearestWalkable(
  g: FloorGrid,
  rIn: number,
  cIn: number,
): [number, number] {
  const r0 = Math.max(0, Math.min(g.rows - 1, Math.round(rIn)));
  const c0 = Math.max(0, Math.min(g.cols - 1, Math.round(cIn)));
  if (isWalkable(g, r0, c0)) return [r0, c0];

  const seen = new Uint8Array(g.rows * g.cols);
  const queue: [number, number][] = [[r0, c0]];
  seen[r0 * g.cols + c0] = 1;
  while (queue.length) {
    const [r, c] = queue.shift()!;
    if (isWalkable(g, r, c)) return [r, c];
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(g, nr, nc) && !seen[nr * g.cols + nc]) {
        seen[nr * g.cols + nc] = 1;
        queue.push([nr, nc]);
      }
    }
  }
  return [r0, c0]; // fallback (fully walled — shouldn't happen)
}
