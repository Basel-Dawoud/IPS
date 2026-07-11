export interface VectorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VectorRoom {
  rects: VectorRect[];
  cx: number;
  cy: number;
}

/** Vector floor map (meter coords) derived from the grid by the backend. */
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

export interface Floor {
  id: string;
  buildingId: string;
  level: number;
  name: string;
  mapUrl: string | null;
  widthMeters: number | null;
  heightMeters: number | null;
  imageWidthPx: number | null;
  imageHeightPx: number | null;
  metersPerPixel: number | null;
  rotationDeg: number;
  originXm: number;
  originYm: number;
  vectorMap: VectorMap | null;
}

export interface CreateFloorInput {
  buildingId: string;
  level: number;
  name: string;
  mapUrl?: string;
  widthMeters?: number;
  heightMeters?: number;
  metersPerPixel?: number;
  rotationDeg?: number;
  originXm?: number;
  originYm?: number;
}

export interface UpdateFloorInput {
  level?: number;
  name?: string;
  mapUrl?: string;
  widthMeters?: number;
  heightMeters?: number;
  metersPerPixel?: number;
  rotationDeg?: number;
  originXm?: number;
  originYm?: number;
}
