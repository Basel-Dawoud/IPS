export interface Deal {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountPct: number | null;
  validFrom: string;
  validUntil: string | null;
  poiId: string;
  poiName: string;
  poiFloorLevel: number;
  buildingId: string;
  buildingName: string;
  buildingImageUrl: string | null;
}
