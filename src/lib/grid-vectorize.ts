import { NpyGrid, parseNpy } from "./npy";

// Converts a numpy occupancy grid into a compact vector floor map in METER
// coords, so the app can render crisp themeable SVG (rooms as polygons, walls as
// rects) instead of a blurry upscaled raster. Cells are merged into a small set
// of rectangles per layer; rooms (cell==5) are emitted as connected components.

const CELL_SIZE = 0.2; // meters per grid cell (matches IPS-Adham + the POI seed)

export interface VectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VectorRoom {
  rects: VectorRect[];
  cx: number; // component centroid (m)
  cy: number;
}

export interface VectorMap {
  cellSize: number;
  widthM: number;
  heightM: number;
  walls: VectorRect[];
  corridors: VectorRect[];
  rooms: VectorRoom[];
  stairs: VectorRect[];
  elevators: VectorRect[];
}

function maskOf(grid: NpyGrid, pred: (v: number) => boolean): Uint8Array {
  const { rows, cols, at } = grid;
  const m = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (pred(Math.round(at(r, c)))) m[r * cols + c] = 1;
    }
  }
  return m;
}

// Greedy rectangle cover of a boolean mask: grow each rect right then down.
function mergeRects(mask: Uint8Array, rows: number, cols: number): VectorRect[] {
  const used = new Uint8Array(rows * cols);
  const rects: VectorRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!mask[i] || used[i]) continue;
      let w = 1;
      while (c + w < cols && mask[r * cols + c + w] && !used[r * cols + c + w]) w++;
      let h = 1;
      grow: while (r + h < rows) {
        for (let k = 0; k < w; k++) {
          const j = (r + h) * cols + c + k;
          if (!mask[j] || used[j]) break grow;
        }
        h++;
      }
      for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) used[(r + dr) * cols + c + dc] = 1;
      }
      rects.push({
        x: c * CELL_SIZE,
        y: r * CELL_SIZE,
        w: w * CELL_SIZE,
        h: h * CELL_SIZE,
      });
    }
  }
  return rects;
}

// 4-connected components of a mask, as arrays of flat cell indices.
function components(mask: Uint8Array, rows: number, cols: number): number[][] {
  const seen = new Uint8Array(rows * cols);
  const comps: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const cells: number[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      cells.push(cur);
      const cr = Math.floor(cur / cols);
      const cc = cur % cols;
      const nbrs = [
        [cr - 1, cc],
        [cr + 1, cc],
        [cr, cc - 1],
        [cr, cc + 1],
      ];
      for (const [nr, nc] of nbrs) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (mask[ni] && !seen[ni]) {
          seen[ni] = 1;
          stack.push(ni);
        }
      }
    }
    comps.push(cells);
  }
  return comps;
}

export function vectorizeGrid(grid: NpyGrid): VectorMap {
  const { rows, cols } = grid;

  const walls = mergeRects(
    maskOf(grid, (v) => v === 1),
    rows,
    cols,
  );
  const corridors = mergeRects(
    maskOf(grid, (v) => v === 6),
    rows,
    cols,
  );
  const stairs = mergeRects(
    maskOf(grid, (v) => v === 2 || v === 4),
    rows,
    cols,
  );
  const elevators = mergeRects(
    maskOf(grid, (v) => v === 3),
    rows,
    cols,
  );

  const roomMask = maskOf(grid, (v) => v === 5);
  const rooms: VectorRoom[] = components(roomMask, rows, cols).map((cells) => {
    const m = new Uint8Array(rows * cols);
    let sr = 0;
    let sc = 0;
    for (const i of cells) {
      m[i] = 1;
      sr += Math.floor(i / cols);
      sc += i % cols;
    }
    return {
      rects: mergeRects(m, rows, cols),
      cx: (sc / cells.length) * CELL_SIZE,
      cy: (sr / cells.length) * CELL_SIZE,
    };
  });

  return {
    cellSize: CELL_SIZE,
    widthM: cols * CELL_SIZE,
    heightM: rows * CELL_SIZE,
    walls,
    corridors,
    rooms,
    stairs,
    elevators,
  };
}

export function vectorizeNpyBuffer(buf: Buffer): VectorMap {
  return vectorizeGrid(parseNpy(buf));
}

export interface TransitionPoint {
  cx: number;
  cy: number;
}

export interface TransitionRegions {
  stairs: TransitionPoint[];
  elevators: TransitionPoint[];
}

function regionCentroids(
  mask: Uint8Array,
  rows: number,
  cols: number,
): TransitionPoint[] {
  return components(mask, rows, cols).map((cells) => {
    let sr = 0;
    let sc = 0;
    for (const i of cells) {
      sr += Math.floor(i / cols);
      sc += i % cols;
    }
    return {
      cx: (sc / cells.length) * CELL_SIZE,
      cy: (sr / cells.length) * CELL_SIZE,
    };
  });
}

export function detectTransitionRegions(grid: NpyGrid): TransitionRegions {
  const { rows, cols } = grid;
  return {
    stairs: regionCentroids(
      maskOf(grid, (v) => v === 2 || v === 4),
      rows,
      cols,
    ),
    elevators: regionCentroids(
      maskOf(grid, (v) => v === 3),
      rows,
      cols,
    ),
  };
}

function clusterRects(rects: VectorRect[]): TransitionPoint[] {
  const EPS = CELL_SIZE; // rects within one cell count as the same shaft
  const parent = rects.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const touches = (a: VectorRect, b: VectorRect) =>
    a.x <= b.x + b.w + EPS &&
    b.x <= a.x + a.w + EPS &&
    a.y <= b.y + b.h + EPS &&
    b.y <= a.y + a.h + EPS;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (touches(rects[i], rects[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, VectorRect[]>();
  rects.forEach((r, i) => {
    const root = find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(r);
  });
  return [...groups.values()].map((group) => {
    let sumA = 0;
    let sx = 0;
    let sy = 0;
    for (const r of group) {
      const a = r.w * r.h || 1;
      sumA += a;
      sx += (r.x + r.w / 2) * a;
      sy += (r.y + r.h / 2) * a;
    }
    return { cx: sx / sumA, cy: sy / sumA };
  });
}

export function transitionRegionsFromVectorMap(
  vm: Pick<VectorMap, "stairs" | "elevators"> | null | undefined,
): TransitionRegions {
  return {
    stairs: clusterRects(vm?.stairs ?? []),
    elevators: clusterRects(vm?.elevators ?? []),
  };
}
