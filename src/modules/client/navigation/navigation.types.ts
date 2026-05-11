export interface RouteRequest {
  startNodeId?: string; // Optional: if starting from a known node
  endNodeId: string;
  currentX?: number; // Optional: if starting from arbitrary location (find nearest node)
  currentY?: number;
  currentFloorLevel?: number;
  buildingId: string;
}

export interface RouteResult {
  path: { x: number; y: number; floorLevel: number }[];
  distance: number;
}
