import { prisma } from "../../../lib/prisma";
import { CreateBuildingInput, UpdateBuildingInput } from "./buildings.types";

export const createBuilding = async (data: CreateBuildingInput) => {
  return prisma.building.create({
    data,
  });
};

async function fetchZoneGeoJson(id: string): Promise<unknown | null> {
  const rows = await prisma.$queryRaw<{ zone_geojson: string | null }[]>`
    SELECT ST_AsGeoJSON(zone) AS zone_geojson FROM "Building" WHERE id = ${id};
  `;
  const raw = rows[0]?.zone_geojson;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const getBuildings = async () => {
  return prisma.building.findMany({
    include: {
      floors: true,
    },
  });
};

export const getBuildingById = async (id: string) => {
  const building = await prisma.building.findUnique({
    where: { id },
    include: {
      floors: true,
    },
  });
  if (!building) return null;
  // Splice in the zone GeoJSON so admin clients (dashboard) can pre-fill the editor.
  const zone = await fetchZoneGeoJson(id);
  return { ...building, zone };
};

export const updateBuilding = async (id: string, data: UpdateBuildingInput) => {
  return prisma.building.update({
    where: { id },
    data,
  });
};

export const deleteBuilding = async (id: string) => {
  return prisma.building.delete({
    where: { id },
  });
};

/**
 * Set the PostGIS geofence for a building. `polygon` must be a valid GeoJSON
 * Polygon (with optional holes). The centroid is recomputed from the polygon.
 *
 * `Building.zone` is declared as `Unsupported(...)` in Prisma so we write it
 * through `$executeRaw`. Returns the count of affected rows.
 */
export const setBuildingZone = async (id: string, polygon: unknown): Promise<number> => {
  const geojson = JSON.stringify(polygon);
  return prisma.$executeRaw`
    UPDATE "Building"
    SET
      "zone" = ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326),
      "centroid" = ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)),
      "updatedAt" = NOW()
    WHERE "id" = ${id};
  `;
};

export const clearBuildingZone = async (id: string): Promise<number> => {
  return prisma.$executeRaw`
    UPDATE "Building"
    SET "zone" = NULL, "centroid" = NULL, "updatedAt" = NOW()
    WHERE "id" = ${id};
  `;
};
