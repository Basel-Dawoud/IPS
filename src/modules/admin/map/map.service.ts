import prisma from "../../../lib/prisma";
import { CreateNodeInput, CreateEdgeInput } from "./map.types";

export const createNode = async (data: CreateNodeInput) => {
  return prisma.mapNode.create({
    data,
  });
};

export const createEdge = async (data: CreateEdgeInput) => {
  let cost = data.cost;

  if (!cost) {
    const fromNode = await prisma.mapNode.findUnique({ where: { id: data.fromNodeId } });
    const toNode = await prisma.mapNode.findUnique({ where: { id: data.toNodeId } });

    if (fromNode && toNode) {
      const dx = fromNode.x - toNode.x;
      const dy = fromNode.y - toNode.y;
      const dz = (fromNode.floorLevel - toNode.floorLevel) * 3; // Assume 3 meters per floor
      cost = Math.sqrt(dx * dx + dy * dy + dz * dz);
    } else {
      cost = 1.0; // Default fallback
    }
  }

  const edge = await prisma.mapEdge.create({
    data: {
      fromNodeId: data.fromNodeId,
      toNodeId: data.toNodeId,
      cost,
      bidirectional: data.bidirectional ?? true,
    },
  });

  if (data.bidirectional !== false) {
    await prisma.mapEdge.create({
      data: {
        fromNodeId: data.toNodeId,
        toNodeId: data.fromNodeId,
        cost,
        bidirectional: true,
      },
    });
  }

  return edge;
};

export const getNodesByFloor = async (buildingId: string, floorLevel: number) => {
  return prisma.mapNode.findMany({
    where: { buildingId, floorLevel },
    include: { edgesFrom: true },
  });
};
