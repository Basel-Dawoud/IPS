export type PoiType = "ROOM" | "LAB" | "TOILET" | "STAIRS" | "ELEVATOR" | "OTHER" | "STORE";

export const POI_TYPES: PoiType[] = [
  "ROOM",
  "LAB",
  "TOILET",
  "STAIRS",
  "ELEVATOR",
  "OTHER",
  "STORE",
];

export interface Poi {
  id: string;
  buildingId: string;
  floorLevel: number;
  name: string;
  code: string | null;
  type: PoiType;
  iconUrl: string | null;
  x: number;
  y: number;
  /** Optional admin-drawn zone (meters, top-left + size, same frame as x/y). */
  areaX: number | null;
  areaY: number | null;
  areaW: number | null;
  areaH: number | null;
  description: string | null;
  category: string | null;
  aliases: string[];
  productKeywords: string[];
  images?: string[];
  active: boolean;
  isEmergencyExit: boolean;
  isGatheringPoint: boolean;
  /** Denormalized review aggregates maintained by the backend. */
  avgRating?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePoiInput {
  buildingId: string;
  floorLevel: number;
  name: string;
  code?: string;
  type: PoiType;
  x: number;
  y: number;
  /** Admin-drawn zone; null clears it (app falls back to auto-derivation). */
  areaX?: number | null;
  areaY?: number | null;
  areaW?: number | null;
  areaH?: number | null;
  description?: string;
  category?: string;
  aliases?: string[];
  productKeywords?: string[];
  images?: string[];
  active?: boolean;
  isEmergencyExit?: boolean;
  isGatheringPoint?: boolean;
}

export interface UpdatePoiInput {
  floorLevel?: number;
  name?: string;
  code?: string;
  type?: PoiType;
  x?: number;
  y?: number;
  areaX?: number | null;
  areaY?: number | null;
  areaW?: number | null;
  areaH?: number | null;
  description?: string;
  category?: string;
  aliases?: string[];
  productKeywords?: string[];
  images?: string[];
  active?: boolean;
  isEmergencyExit?: boolean;
  isGatheringPoint?: boolean;
}

/** Floor as needed by the POI picker — includes the plan image + real-world extent. */
export interface PoiFloor {
  id: string;
  buildingId: string;
  level: number;
  name: string;
  mapUrl: string | null;
  widthMeters: number | null;
  heightMeters: number | null;
}
