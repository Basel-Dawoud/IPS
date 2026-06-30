import { PoiType } from "../../../generated/prisma/enums";

export interface CreatePoiInput {
  buildingId: string;
  floorLevel: number;
  name: string;
  code?: string;
  type: PoiType;
  x: number;
  y: number;
  description?: string;
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
  x?: number;
  y?: number;
  description?: string;
  category?: string;
  aliases?: string[];
  productKeywords?: string[];
  active?: boolean;
}
