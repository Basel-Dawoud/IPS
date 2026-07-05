export interface CreateBuildingInput {
  code: string;
  name: string;
  description?: string;
  imageUrl?: string;
  /** Explicit map pin (outdoor map marker + directions target). */
  pinLat?: number | null;
  pinLng?: number | null;
  /** Compass bearing of the floor map's "up" direction (deg from true north). */
  northOffsetDeg?: number | null;
}

export interface UpdateBuildingInput {
  code?: string;
  name?: string;
  description?: string;
  imageUrl?: string | null;
  pinLat?: number | null;
  pinLng?: number | null;
  northOffsetDeg?: number | null;
}
