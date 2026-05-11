import { prisma } from "../../../lib/prisma";
import { CreateBuildingInput, UpdateBuildingInput } from "./buildings.types";

export const createBuilding = async (data: CreateBuildingInput) => {
  return prisma.building.create({
    data,
  });
};

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

export const updateBuilding = async (id: string, data: UpdateBuildingInput) => {
  return prisma.building.update({
    where: { id },
    data,
  });
};

export const deleteBuilding = async (id: string) => {
  return prisma.building.delete({
    where: { id },
  });
};
