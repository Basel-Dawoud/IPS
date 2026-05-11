import prisma from "../../../lib/prisma";

export const getBuildings = async () => {
  return prisma.building.findMany({
    include: {
      floors: true,
    },
  });
};

export const getBuildingById = async (id: string) => {
  return prisma.building.findUnique({
    where: { id },
    include: {
      floors: true,
    },
  });
};
