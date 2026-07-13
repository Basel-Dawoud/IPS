export type PoiType = "ROOM" | "LAB" | "TOILET" | "STAIRS" | "ELEVATOR" | "OTHER" | "STORE";

/** A taxonomy node linked to a POI. parentId null => a top-level category. */
export interface PoiCategoryRef {
  id: string;
  name: string;
  parentId: string | null;
}

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
  /** Primary (single) category name — legacy display convenience. */
  category: string | null;
  /** Full many-to-many taxonomy membership (categories + sub-categories). */
  categories: PoiCategoryRef[];
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
  /** Taxonomy node ids (categories AND sub-categories) to link. */
  categoryIds?: string[];
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
  categoryIds?: string[];
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
