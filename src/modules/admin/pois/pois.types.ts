import { PoiType } from "../../../generated/prisma/enums";

export interface CreatePoiInput {
  buildingId: string;
  floorLevel: number;
  name: string;
  code?: string;
  type: PoiType;
  iconUrl?: string;
  x: number;
  y: number;
  /** Optional admin-drawn zone (meters, top-left + size, same frame as x/y). */
  areaX?: number | null;
  areaY?: number | null;
  areaW?: number | null;
  areaH?: number | null;
  description?: string;
  /** Taxonomy node ids (categories AND sub-categories) linked to this POI. */
  categoryIds?: string[];
  aliases?: string[];
  productKeywords?: string[];
  images?: string[];
  active?: boolean;
}

export interface UpdatePoiInput {
  floorLevel?: number;
  name?: string;
  code?: string;
  type?: PoiType;
  iconUrl?: string;
  x?: number;
  y?: number;
  /** null clears the saved zone (app falls back to the auto-derived one). */
  areaX?: number | null;
  areaY?: number | null;
  areaW?: number | null;
  areaH?: number | null;
  description?: string;
  /** Taxonomy node ids to set (replaces the POI's whole membership). */
  categoryIds?: string[];
  aliases?: string[];
  productKeywords?: string[];
  images?: string[];
  active?: boolean;
}
