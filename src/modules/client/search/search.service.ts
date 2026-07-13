import prisma from "../../../lib/prisma";

export interface SearchBuilding {
  id: string;
  name: string;
  code: string;
  imageUrl: string | null;
}

export interface SearchPoi {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  x: number;
  y: number;
  floorLevel: number;
  buildingId: string;
  buildingName: string;
}

export interface SearchResults {
  buildings: SearchBuilding[];
  pois: SearchPoi[];
}

/**
 * Global search for the Home screen: matches building names/codes and active
 * shop (POI) names/codes/aliases. POIs carry their building + coordinates so
 * a tap can deep-link straight into navigation.
 */
export const search = async (q: string): Promise<SearchResults> => {
  const term = q.trim();
  if (term.length < 2) return { buildings: [], pois: [] };

  const [buildings, pois] = await Promise.all([
    prisma.building.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { code: { contains: term, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, code: true, imageUrl: true },
      take: 8,
    }),
    prisma.poi.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { code: { contains: term, mode: "insensitive" } },
          { aliases: { has: term.toLowerCase() } },
        ],
      },
      select: {
        id: true,
        name: true,
        code: true,
        x: true,
        y: true,
        floorLevel: true,
        buildingId: true,
        building: { select: { name: true } },
        categories: { select: { name: true, parentId: true } },
      },
      take: 12,
    }),
  ]);

  return {
    buildings,
    pois: pois.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      category:
        (p.categories.find((c) => c.parentId) ?? p.categories[0])?.name ?? null,
      x: p.x,
      y: p.y,
      floorLevel: p.floorLevel,
      buildingId: p.buildingId,
      buildingName: p.building.name,
    })),
  };
};
