import prisma from "../../../lib/prisma";
import { RouteRequest, RouteResult } from "./navigation.types";

interface GraphNode {
  id: string;
  x: number;
  y: number;
  floorLevel: number;
  edges: { to: string; cost: number }[];
}

export const calculateRoute = async (data: RouteRequest): Promise<RouteResult> => {
  const nodes = await prisma.mapNode.findMany({
    where: { buildingId: data.buildingId },
    include: { edgesFrom: true, edgesTo: true },
  });

  const graph: Record<string, GraphNode> = {};
  nodes.forEach((node: any) => {
    graph[node.id] = {
      id: node.id,
      x: node.x,
      y: node.y,
      floorLevel: node.floorLevel,
      edges: [
        ...node.edgesFrom.map((e: any) => ({ to: e.toNodeId, cost: e.cost })),
        ...node.edgesTo
          .filter((e: any) => e.bidirectional)
          .map((e: any) => ({ to: e.fromNodeId, cost: e.cost })),
      ],
    };
  });

  let startNodeId = data.startNodeId;
  if (
    !startNodeId &&
    data.currentX !== undefined &&
    data.currentY !== undefined &&
    data.currentFloorLevel !== undefined
  ) {
    let minDist = Infinity;
    for (const node of nodes) {
      if (node.floorLevel === data.currentFloorLevel) {
        const dist = Math.sqrt(
          Math.pow(node.x - data.currentX, 2) + Math.pow(node.y - data.currentY, 2)
        );
        if (dist < minDist) {
          minDist = dist;
          startNodeId = node.id;
        }
      }
    }
  }

  if (!startNodeId || !graph[startNodeId]) {
    throw new Error("Start node not found");
  }
  if (!graph[data.endNodeId]) {
    throw new Error("End node not found");
  }

  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const queue: Set<string> = new Set(Object.keys(graph));

  Object.keys(graph).forEach((id) => {
    distances[id] = Infinity;
    previous[id] = null;
  });
  distances[startNodeId] = 0;

  while (queue.size > 0) {
    let u: string | null = null;
    let min = Infinity;
    for (const id of queue) {
      if (distances[id] < min) {
        min = distances[id];
        u = id;
      }
    }

    if (u === null || u === data.endNodeId) break; // Target reached or unreachable
    queue.delete(u);

    const neighbors = graph[u].edges;
    for (const neighbor of neighbors) {
      if (queue.has(neighbor.to)) {
        const alt = distances[u] + neighbor.cost;
        if (alt < distances[neighbor.to]) {
          distances[neighbor.to] = alt;
          previous[neighbor.to] = u;
        }
      }
    }
  }

  const path: { x: number; y: number; floorLevel: number }[] = [];
  let current: string | null = data.endNodeId;

  if (previous[current] !== null || current === startNodeId) {
    while (current !== null) {
      const node = graph[current];
      path.unshift({ x: node.x, y: node.y, floorLevel: node.floorLevel });
      current = previous[current];
    }
  }

  if (path.length === 0 || distances[data.endNodeId] === Infinity) {
    throw new Error("No route found between the specified nodes");
  }

  return {
    path,
    distance: distances[data.endNodeId],
  };
};
