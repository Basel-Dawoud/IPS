export type PoiType = "ROOM" | "LAB" | "TOILET" | "STAIRS" | "ELEVATOR" | "OTHER" | "STORE";

export interface Poi {
  id: string;
  buildingId: string;
  floorLevel: number;
  name: string;
  code: string | null;
  type: PoiType;
  /** Optional per-POI marker icon (rendered instead of the dot when set). */
  iconUrl?: string | null;
  x: number;
  y: number;
  /** Optional admin-drawn zone (meters, top-left + size, same frame as x/y). */
  areaX?: number | null;
  areaY?: number | null;
  areaW?: number | null;
  areaH?: number | null;
  description: string | null;
  category: string | null;
  aliases: string[];
  productKeywords: string[];
  images?: string[];
  active: boolean;
  isEmergencyExit?: boolean;
  isGatheringPoint?: boolean;
}
