export interface RecentBuildingVisit {
  id: string;
  buildingId: string;
  buildingName: string;
  buildingDescription: string | null;
  buildingImageUrl: string | null;
  buildingCode: string;
  /** The last shop the user navigated to inside this building, if any. */
  lastPoiId: string | null;
  lastPoiName: string | null;
  lastPoiFloorLevel: number | null;
  enteredAt: string;
  leftAt: string | null;
}
