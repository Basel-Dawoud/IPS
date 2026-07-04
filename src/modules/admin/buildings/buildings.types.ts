export interface CreateBuildingInput {
  code: string;
  name: string;
  description?: string;
  imageUrl?: string;
  /** Explicit map pin (outdoor map marker + directions target). */
  pinLat?: number | null;
  pinLng?: number | null;
}

export interface UpdateBuildingInput {
  code?: string;
  name?: string;
  description?: string;
  imageUrl?: string | null;
  pinLat?: number | null;
  pinLng?: number | null;
}
