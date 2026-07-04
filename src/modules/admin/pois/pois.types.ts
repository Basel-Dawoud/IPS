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
  categoryId?: string;
  /** Free-text category name — resolved via connectOrCreate. */
  category?: string;
  aliases?: string[];
  productKeywords?: string[];
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
  categoryId?: string;
  /** Free-text category name; empty string disconnects the category. */
  category?: string;
  aliases?: string[];
  productKeywords?: string[];
  active?: boolean;
}
