import prisma from "../../../lib/prisma";

export const getBuildings = async () => {
  return prisma.building.findMany({
    include: {
      floors: true,
    },
  });
};

export const getBuildingById = async (id: string) => {
  return prisma.building.findUnique({
    where: { id },
    include: {
      floors: true,

      beacons: {
        where: { active: true },
        select: { beaconUid: true, serviceData: true, floorLevel: true },
      },
    },
  });
};

export interface NearbyBuildingRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  centroid: { lat: number; lng: number } | null;
  distanceMeters: number;
  insideZone: boolean;
}

interface NearbyRawRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  centroid_geojson: string | null;
  distance_meters: number | null;
  inside_zone: boolean;
}

/**
 * Find buildings whose `zone` polygon contains the point, or whose centroid
 * is within `radiusMeters` of it. Results are ordered "inside-zone first,
 * then by distance ascending".
 */
export const getNearbyBuildings = async (
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<NearbyBuildingRow[]> => {
  const rows = await prisma.$queryRaw<NearbyRawRow[]>`
    SELECT
      id,
      code,
      name,
      description,
      ST_AsGeoJSON(centroid) AS centroid_geojson,
      ST_Distance(
        centroid::geography,
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
      ) AS distance_meters,
      COALESCE(
        ST_Contains(zone, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)),
        false
      ) AS inside_zone
    FROM "Building"
    WHERE zone IS NOT NULL
      AND (
        ST_Contains(zone, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326))
        OR ST_DWithin(
          centroid::geography,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${radiusMeters}::float8
        )
      )
    ORDER BY inside_zone DESC, distance_meters ASC
    LIMIT 5;
  `;

  return rows.map((r) => {
    let centroid: { lat: number; lng: number } | null = null;
    if (r.centroid_geojson) {
      try {
        const parsed = JSON.parse(r.centroid_geojson);
        if (parsed?.type === "Point" && Array.isArray(parsed.coordinates)) {
          centroid = {
            lng: Number(parsed.coordinates[0]),
            lat: Number(parsed.coordinates[1]),
          };
        }
      } catch {
        // ignore malformed GeoJSON
      }
    }
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      centroid,
      distanceMeters: r.distance_meters ?? Number.POSITIVE_INFINITY,
      insideZone: r.inside_zone,
    };
  });
};
