import { prisma } from "../../../lib/prisma";
import { CreateFloorInput, UpdateFloorInput } from "./floors.types";

export const createFloor = async (data: CreateFloorInput) => {
  return prisma.floor.create({
    data,
  });
};

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

export const updateFloor = async (id: string, data: UpdateFloorInput) => {
  return prisma.floor.update({
    where: { id },
    data,
  });
};

export const deleteFloor = async (id: string) => {
  return prisma.floor.delete({
    where: { id },
  });
};
