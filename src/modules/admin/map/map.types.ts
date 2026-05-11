import { MapNodeType } from "../../../generated/prisma/enums";

export interface CreateNodeInput {
  buildingId: string;
  floorLevel: number;
  x: number;
  y: number;
  type: MapNodeType;
  poiId?: string;
}

export interface CreateEdgeInput {
  fromNodeId: string;
  toNodeId: string;
  cost?: number; // If not provided, calculated as Euclidean distance
  bidirectional?: boolean;
}
