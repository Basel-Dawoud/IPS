export interface CreateFloorInput {
  buildingId: string;
  level: number;
  name: string;
  mapUrl?: string;
  widthMeters?: number;
  heightMeters?: number;
  imageWidthPx?: number;
  imageHeightPx?: number;
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
  imageWidthPx?: number;
  imageHeightPx?: number;
  metersPerPixel?: number;
  rotationDeg?: number;
  originXm?: number;
  originYm?: number;
}

export interface SetFloorImageInput {
  mapUrl: string;
  imageWidthPx: number;
  imageHeightPx: number;
  // Vector floor map derived from an uploaded grid (null for raster images).
  vectorMap?: unknown;
}
