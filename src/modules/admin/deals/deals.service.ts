import prisma from "../../../lib/prisma";
import { CreateDealInput, UpdateDealInput } from "./deals.types";

export const createDeal = async (data: CreateDealInput) => {
  return prisma.deal.create({
    data,
    include: { poi: { select: { id: true, name: true, buildingId: true } } },
  });
};

export const getDealsByBuilding = async (buildingId: string) => {
  return prisma.deal.findMany({
    where: { poi: { buildingId } },
    include: { poi: { select: { id: true, name: true, floorLevel: true } } },
    orderBy: { createdAt: "desc" },
  });
};

export const getDealsByPoi = async (poiId: string) => {
  return prisma.deal.findMany({
    where: { poiId },
    orderBy: { createdAt: "desc" },
  });
};

export const getDealById = async (id: string) => {
  return prisma.deal.findUnique({
    where: { id },
    include: { poi: { select: { id: true, name: true, buildingId: true, floorLevel: true } } },
  });
};

export const updateDeal = async (id: string, data: UpdateDealInput) => {
  return prisma.deal.update({
    where: { id },
    data,
    include: { poi: { select: { id: true, name: true, buildingId: true } } },
  });
};

export const deleteDeal = async (id: string) => {
  return prisma.deal.delete({ where: { id } });
};

export const toggleDealActive = async (id: string, active: boolean) => {
  return prisma.deal.update({
    where: { id },
    data: { active },
  });
};

export const setDealImage = async (id: string, imageUrl: string) => {
  return prisma.deal.update({ where: { id }, data: { imageUrl } });
};
