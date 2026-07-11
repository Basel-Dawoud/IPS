import prisma from "../../../lib/prisma";
import type { BlockedZone } from "./emergency.schema";

export const getEmergencyState = async (buildingId: string) => {
  let alert = await prisma.emergencyAlert.findUnique({
    where: { buildingId },
  });
  if (!alert) {
    alert = await prisma.emergencyAlert.create({
      data: {
        buildingId,
        isActive: false,
        blockedPoiIds: [],
        blockedZones: [],
      },
    });
  }
  return alert;
};

export const triggerEmergency = async (
  buildingId: string,
  data: {
    gatheringPointId?: string | null;
    blockedPoiIds?: string[];
    blockedZones?: BlockedZone[];
    message?: string;
  }
) => {
  return prisma.emergencyAlert.upsert({
    where: { buildingId },
    update: {
      isActive: true,
      gatheringPointId: data.gatheringPointId ?? null,
      blockedPoiIds: data.blockedPoiIds ?? [],
      blockedZones: data.blockedZones ?? [],
      message: data.message ?? "Emergency alert! Please evacuate.",
    },
    create: {
      buildingId,
      isActive: true,
      gatheringPointId: data.gatheringPointId ?? null,
      blockedPoiIds: data.blockedPoiIds ?? [],
      blockedZones: data.blockedZones ?? [],
      message: data.message ?? "Emergency alert! Please evacuate.",
    },
  });
};

export const clearEmergency = async (buildingId: string) => {
  return prisma.emergencyAlert.upsert({
    where: { buildingId },
    update: {
      isActive: false,
      message: null,
      gatheringPointId: null,
      blockedPoiIds: [],
      blockedZones: [],
    },
    create: {
      buildingId,
      isActive: false,
      blockedPoiIds: [],
      blockedZones: [],
    },
  });
};
