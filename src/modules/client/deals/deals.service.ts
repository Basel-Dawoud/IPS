import prisma from "../../../lib/prisma";

export interface ClientDeal {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountPct: number | null;
  validFrom: Date;
  validUntil: Date | null;
  poiId: string;
  poiName: string;
  poiFloorLevel: number;
  buildingId: string;
  buildingName: string;
  buildingImageUrl: string | null;
}

// Shared POI/building projection + row→ClientDeal mapper (keeps the list and
// single-deal queries in sync).
const dealInclude = {
  poi: {
    select: {
      id: true,
      name: true,
      floorLevel: true,
      building: {
        select: { id: true, name: true, imageUrl: true },
      },
    },
  },
} as const;

type DealRow = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountPct: number | null;
  validFrom: Date;
  validUntil: Date | null;
  poi: {
    id: string;
    name: string;
    floorLevel: number;
    building: { id: string; name: string; imageUrl: string | null };
  };
};

const toClientDeal = (d: DealRow): ClientDeal => ({
  id: d.id,
  title: d.title,
  description: d.description,
  imageUrl: d.imageUrl,
  discountPct: d.discountPct,
  validFrom: d.validFrom,
  validUntil: d.validUntil,
  poiId: d.poi.id,
  poiName: d.poi.name,
  poiFloorLevel: d.poi.floorLevel,
  buildingId: d.poi.building.id,
  buildingName: d.poi.building.name,
  buildingImageUrl: d.poi.building.imageUrl,
});

const activeWindow = (now: Date) => ({
  active: true as const,
  validFrom: { lte: now },
  OR: [{ validUntil: null }, { validUntil: { gte: now } }],
});

/**
 * Fetch active, non-expired deals for a specific building. Used when the user
 * is near or inside a building and we show "Today's Hot Deals".
 */
export const getActiveDealsForBuilding = async (buildingId: string): Promise<ClientDeal[]> => {
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: { ...activeWindow(now), poi: { buildingId, active: true } },
    include: dealInclude,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return deals.map(toClientDeal);
};

/**
 * Fetch hot deals from all nearby buildings (within the given building IDs).
 */
export const getHotDealsNearby = async (buildingIds: string[]): Promise<ClientDeal[]> => {
  if (buildingIds.length === 0) return [];
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: { ...activeWindow(now), poi: { buildingId: { in: buildingIds }, active: true } },
    include: dealInclude,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return deals.map(toClientDeal);
};

/** Fetch a single deal by id (for the deal details page). */
export const getDealById = async (id: string): Promise<ClientDeal | null> => {
  const deal = await prisma.deal.findUnique({ where: { id }, include: dealInclude });
  return deal ? toClientDeal(deal) : null;
};
