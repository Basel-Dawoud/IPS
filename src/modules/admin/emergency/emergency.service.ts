import prisma from "../../../lib/prisma";

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
      },
    });
  }
  return alert;
};

export const triggerEmergency = async (
  buildingId: string,
  data: { gatheringPointId?: string | null; blockedPoiIds?: string[]; message?: string }
) => {
  return prisma.emergencyAlert.upsert({
    where: { buildingId },
    update: {
      isActive: true,
      gatheringPointId: data.gatheringPointId ?? null,
      blockedPoiIds: data.blockedPoiIds ?? [],
      message: data.message ?? "Emergency alert! Please evacuate.",
    },
    create: {
      buildingId,
      isActive: true,
      gatheringPointId: data.gatheringPointId ?? null,
      blockedPoiIds: data.blockedPoiIds ?? [],
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
    },
    create: {
      buildingId,
      isActive: false,
      blockedPoiIds: [],
    },
  });
};
