import { PNG } from "pngjs";

// Minimal NumPy .npy reader + a grid→PNG renderer. The floor maps originate as
// 2D occupancy grids (see IPS-Adham-Smart-Mall: 0 free, 1 wall, 2/4 stairs,
// 3 elevator, 5 room, 6 corridor) saved with numpy.save. We parse the header,
// read the values, and render one pixel per cell.

export interface NpyGrid {
  rows: number;
  cols: number;
  at: (r: number, c: number) => number;
}

function makeReader(buf: Buffer, dataOffset: number, descr: string) {
  const little = descr[0] !== ">";
  const code = descr.replace(/^[<>|=]/, ""); // e.g. "i8", "u1", "f8", "b1"
  const kind = code[0];
  const size = parseInt(code.slice(1), 10);

  const read = (elemIndex: number): number => {
    const off = dataOffset + elemIndex * size;
    if (kind === "f") {
      if (size === 8) return little ? buf.readDoubleLE(off) : buf.readDoubleBE(off);
      if (size === 4) return little ? buf.readFloatLE(off) : buf.readFloatBE(off);
    } else if (kind === "i") {
      if (size === 1) return buf.readInt8(off);
      if (size === 2) return little ? buf.readInt16LE(off) : buf.readInt16BE(off);
      if (size === 4) return little ? buf.readInt32LE(off) : buf.readInt32BE(off);
      if (size === 8) return Number(little ? buf.readBigInt64LE(off) : buf.readBigInt64BE(off));
    } else if (kind === "u" || kind === "b") {
      if (size === 1) return buf.readUInt8(off);
      if (size === 2) return little ? buf.readUInt16LE(off) : buf.readUInt16BE(off);
      if (size === 4) return little ? buf.readUInt32LE(off) : buf.readUInt32BE(off);
      if (size === 8) return Number(little ? buf.readBigUInt64LE(off) : buf.readBigUInt64BE(off));
    }
    throw new Error(`Unsupported .npy dtype: ${descr}`);
  };

  return read;
}

export function parseNpy(buf: Buffer): NpyGrid {
  if (buf.subarray(0, 6).toString("latin1") !== "\x93NUMPY") {
    throw new Error("Not a .npy file");
  }
  const major = buf.readUInt8(6);
  let headerLen: number;
  let headerStart: number;
  if (major === 1) {
    headerLen = buf.readUInt16LE(8);
    headerStart = 10;
  } else {
    headerLen = buf.readUInt32LE(8);
    headerStart = 12;
  }
  const header = buf.subarray(headerStart, headerStart + headerLen).toString("latin1");

  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);
  const descrMatch = header.match(/'descr':\s*'([^']+)'/);
  if (!shapeMatch || !descrMatch) throw new Error("Malformed .npy header");

  const dims = shapeMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const descr = descrMatch[1];
  const fortran = /'fortran_order':\s*True/.test(header);

  let rows: number;
  let cols: number;
  if (dims.length === 2) {
    [rows, cols] = dims;
  } else if (dims.length === 1) {
    rows = 1;
    cols = dims[0];
  } else {
    throw new Error("Only 1D/2D .npy grids are supported");
  }

  const read = makeReader(buf, headerStart + headerLen, descr);
  const at = (r: number, c: number) => read(fortran ? c * rows + r : r * cols + c);
  return { rows, cols, at };
}

// Cell code → RGB. Matches the IPS-Adham grid encoding.
const CELL_COLORS: Record<number, [number, number, number]> = {
  0: [255, 255, 255], // free / walkable
  1: [17, 24, 39], // wall / obstacle
  2: [245, 158, 11], // stairs
  3: [59, 130, 246], // elevator
  4: [245, 158, 11], // stairs (alt)
  5: [219, 234, 254], // room
  6: [241, 245, 249], // corridor
};

export function renderGridPng(grid: NpyGrid): Buffer {
  const { rows, cols, at } = grid;
  const png = new PNG({ width: cols, height: rows });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = Math.round(at(r, c));
      const [red, green, blue] = CELL_COLORS[v] ?? [255, 255, 255];
      const idx = (r * cols + c) * 4;
      png.data[idx] = red;
      png.data[idx + 1] = green;
      png.data[idx + 2] = blue;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}
