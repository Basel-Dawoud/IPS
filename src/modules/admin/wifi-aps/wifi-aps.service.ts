import prisma from "../../../lib/prisma";
import { CreateWifiApInput, UpdateWifiApInput } from "./wifi-aps.types";

export const createWifiAp = async (data: CreateWifiApInput) => {
  // Normalise BSSID to lower-case so comparisons are case-insensitive
  return prisma.wifiAccessPoint.create({
    data: {
      ...data,
      bssid: data.bssid.toLowerCase(),
    },
  });
};

export const getWifiApsByBuilding = async (buildingId: string) => {
  return prisma.wifiAccessPoint.findMany({
    where: { buildingId },
    orderBy: [{ floorLevel: "asc" }, { bssid: "asc" }],
  });
};

export const updateWifiAp = async (id: string, data: UpdateWifiApInput) => {
  return prisma.wifiAccessPoint.update({
    where: { id },
    data,
  });
};

export const deleteWifiAp = async (id: string) => {
  return prisma.wifiAccessPoint.delete({
    where: { id },
  });
};
