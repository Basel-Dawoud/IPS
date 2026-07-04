import prisma from "../../../lib/prisma";

export interface RecentBuildingVisit {
  id: string;
  buildingId: string;
  buildingName: string;
  buildingDescription: string | null;
  buildingImageUrl: string | null;
  buildingCode: string;
  // The last shop (POI) the user navigated to inside this building, if any.
  lastPoiId: string | null;
  lastPoiName: string | null;
  lastPoiFloorLevel: number | null;
  enteredAt: Date;
  leftAt: Date | null;
}

/**
 * Record that the user chose to navigate in a building (and, when known, the
 * shop they navigated to). Recency-refreshing: reuses the open visit for the
 * building (bumping enteredAt + poiId) so "Visit Again" reflects the latest
 * navigation instead of piling up rows.
 */
export const recordBuildingVisit = async (
  userId: string,
  buildingId: string,
  poiId?: string | null,
): Promise<{ id: string; alreadyOpen: boolean }> => {
  const existing = await prisma.buildingVisit.findFirst({
    where: { userId, buildingId, leftAt: null },
    select: { id: true },
  });

  if (existing) {
    await prisma.buildingVisit.update({
      where: { id: existing.id },
      data: { enteredAt: new Date(), ...(poiId !== undefined ? { poiId } : {}) },
    });
    return { id: existing.id, alreadyOpen: true };
  }

  const visit = await prisma.buildingVisit.create({
    data: { userId, buildingId, poiId: poiId ?? null },
  });

  return { id: visit.id, alreadyOpen: false };
};

/**
 * Close an open visit (set leftAt). Called when the user leaves the building zone.
 */
export const closeBuildingVisit = async (
  userId: string,
  buildingId: string,
): Promise<void> => {
  const open = await prisma.buildingVisit.findFirst({
    where: { userId, buildingId, leftAt: null },
    orderBy: { enteredAt: "desc" },
  });

  if (open) {
    await prisma.buildingVisit.update({
      where: { id: open.id },
      data: { leftAt: new Date() },
    });
  }
};

/**
 * Get the user's recent building visits (distinct buildings, most recent first).
 */
export const getRecentBuildingVisits = async (
  userId: string,
  limit = 5,
): Promise<RecentBuildingVisit[]> => {
  const visits = await prisma.buildingVisit.findMany({
    where: { userId },
    include: {
      building: {
        select: { id: true, name: true, description: true, imageUrl: true, code: true },
      },
      poi: { select: { id: true, name: true, floorLevel: true } },
    },
    orderBy: { enteredAt: "desc" },
    take: limit * 3, // over-fetch to deduplicate
  });

  // Deduplicate by buildingId — keep only the most recent visit per building
  const seen = new Set<string>();
  const unique: RecentBuildingVisit[] = [];
  for (const v of visits) {
    if (seen.has(v.buildingId)) continue;
    seen.add(v.buildingId);
    unique.push({
      id: v.id,
      buildingId: v.buildingId,
      buildingName: v.building.name,
      buildingDescription: v.building.description,
      buildingImageUrl: v.building.imageUrl,
      buildingCode: v.building.code,
      lastPoiId: v.poi?.id ?? null,
      lastPoiName: v.poi?.name ?? null,
      lastPoiFloorLevel: v.poi?.floorLevel ?? null,
      enteredAt: v.enteredAt,
      leftAt: v.leftAt,
    });
    if (unique.length >= limit) break;
  }

  return unique;
};
