import prisma from "../../../lib/prisma";
import { CreateBeaconInput, UpdateBeaconInput } from "./beacons.types";

export const createBeacon = async (data: CreateBeaconInput) => {
  return prisma.bleBeacon.create({
    data,
  });
};

export const getBeaconsByBuilding = async (buildingId: string) => {
  return prisma.bleBeacon.findMany({
    where: { buildingId },
  });
};

export const updateBeacon = async (id: string, data: UpdateBeaconInput) => {
  return prisma.bleBeacon.update({
    where: { id },
    data,
  });
};

export const deleteBeacon = async (id: string) => {
  return prisma.bleBeacon.delete({
    where: { id },
  });
};
