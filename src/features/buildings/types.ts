import type { Polygon } from "geojson";
import type { Floor } from "@/features/floors/types";

export interface Building {
  id: string;
  code: string;
  name: string;
  description: string | null;
  imageUrl?: string | null;
  /** GeoJSON polygon — only included on single-building GET. */
  zone?: Polygon | null;
  /** Explicit outdoor map pin (marker + directions target in the app). */
  pinLat?: number | null;
  pinLng?: number | null;
  /**
   * Compass bearing (deg, 0-360) that the floor map's "up" (-y) direction points
   * toward in the real world. Drives the app's user-direction cone.
   */
  northOffsetDeg?: number | null;
  /** Included on list + single-building GET (backend `include: { floors }`). */
  floors?: Floor[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBuildingInput {
  code: string;
  name: string;
  description?: string;
  imageUrl?: string;
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
  northOffsetDeg?: number | null;
}
