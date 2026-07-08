export interface SearchBuilding {
  id: string;
  name: string;
  code: string;
  imageUrl: string | null;
}

export interface SearchPoi {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  x: number;
  y: number;
  floorLevel: number;
  buildingId: string;
  buildingName: string;
}

export interface SearchResults {
  buildings: SearchBuilding[];
  pois: SearchPoi[];
}
