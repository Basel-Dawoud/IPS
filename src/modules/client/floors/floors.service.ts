import prisma from "../../../lib/prisma";

export const getFloorsByBuilding = async (buildingId: string) => {
  return prisma.floor.findMany({
    where: { buildingId },
    orderBy: { level: "asc" },
  });
};

export const getFloorById = async (id: string) => {
  return prisma.floor.findUnique({
    where: { id },
  });
};
