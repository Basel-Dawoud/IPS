import { prisma } from "../../../lib/prisma";

export interface IpsRoom {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IpsFloor {
  level: number;
  name: string | null;
  widthM: number | null;
  heightM: number | null;
  mapUrl: string | null;
  rooms: IpsRoom[];
}

export interface IpsBuilding {
  id: string;
  code: string;
  name: string;
  floors: IpsFloor[];
}

// Consolidated geometry export for the IPS analytics plane (FastAPI). One call
// returns every building with its floors and the POI zone rects (meters) that
// act as heatmap "rooms". POIs without a saved zone rect are excluded.
export const getGeometry = async (): Promise<{ buildings: IpsBuilding[] }> => {
  const buildings = await prisma.building.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      floors: {
        orderBy: { level: "asc" },
        select: {
          level: true,
          name: true,
          widthMeters: true,
          heightMeters: true,
          mapUrl: true,
        },
      },
      pois: {
        where: {
          areaX: { not: null },
          areaY: { not: null },
          areaW: { not: null },
          areaH: { not: null },
        },
        select: {
          id: true,
          name: true,
          type: true,
          floorLevel: true,
          areaX: true,
          areaY: true,
          areaW: true,
          areaH: true,
        },
      },
    },
  });

  return {
    buildings: buildings.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      floors: b.floors.map((f) => ({
        level: f.level,
        name: f.name,
        widthM: f.widthMeters,
        heightM: f.heightMeters,
        mapUrl: f.mapUrl,
        rooms: b.pois
          .filter((p) => p.floorLevel === f.level)
          .map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            x: p.areaX as number,
            y: p.areaY as number,
            w: p.areaW as number,
            h: p.areaH as number,
          })),
      })),
    })),
  };
};
