export interface PathPoint {
  x: number;
  y: number;
  floorLevel: number;
}

export interface Route {
  path: PathPoint[];
  distance: number;
}

export interface RouteRequest {
  buildingId: string;
  endNodeId: string;
  currentX?: number;
  currentY?: number;
  currentFloorLevel?: number;
  startNodeId?: string;
}
