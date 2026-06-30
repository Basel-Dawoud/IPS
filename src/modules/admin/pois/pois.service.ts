import prisma from "../../../lib/prisma";
import { CreatePoiInput, UpdatePoiInput } from "./pois.types";

export const createPoi = async (data: CreatePoiInput) => {
  return prisma.poi.create({
    data,
  });
};

export const getPois = async (buildingId: string, floorLevel?: number) => {
  return prisma.poi.findMany({
    where: {
      buildingId,
      ...(floorLevel !== undefined ? { floorLevel } : {}),
    },
    orderBy: [{ floorLevel: "asc" }, { name: "asc" }],
  });
};

export const getPoiById = async (id: string) => {
  return prisma.poi.findUnique({
    where: { id },
  });
};

export const updatePoi = async (id: string, data: UpdatePoiInput) => {
  return prisma.poi.update({
    where: { id },
    data,
  });
};

export const deletePoi = async (id: string) => {
  return prisma.poi.delete({
    where: { id },
  });
};
