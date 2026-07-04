import prisma from "../../../lib/prisma";

/** GeoJSON point coords for a building's map location (pin wins, else centroid). */
interface LocationRow {
  id: string;
  pin_lat: number | null;
  pin_lng: number | null;
  centroid_geojson: string | null;
}

function parseCentroid(geojson: string | null): { lat: number; lng: number } | null {
  if (!geojson) return null;
  try {
    const parsed = JSON.parse(geojson);
    if (parsed?.type === "Point" && Array.isArray(parsed.coordinates)) {
      return { lng: Number(parsed.coordinates[0]), lat: Number(parsed.coordinates[1]) };
    }
  } catch {
    // ignore malformed GeoJSON
  }
  return null;
}

export const getBuildings = async () => {
  const buildings = await prisma.building.findMany({
    include: {
      floors: true,
    },
  });
  // Splice in a map location per building: explicit pin wins, else centroid.
  const rows = await prisma.$queryRaw<LocationRow[]>`
    SELECT id, "pinLat" AS pin_lat, "pinLng" AS pin_lng,
           ST_AsGeoJSON(centroid) AS centroid_geojson
    FROM "Building";
  `;
  const locations = new Map(
    rows.map((r) => [
      r.id,
      r.pin_lat != null && r.pin_lng != null
        ? { lat: r.pin_lat, lng: r.pin_lng }
        : parseCentroid(r.centroid_geojson),
    ]),
  );
  return buildings.map((b) => ({ ...b, location: locations.get(b.id) ?? null }));
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
  imageUrl: string | null;
  centroid: { lat: number; lng: number } | null;
  distanceMeters: number;
  insideZone: boolean;
}

interface NearbyRawRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  image_url: string | null;
  pin_lat: number | null;
  pin_lng: number | null;
  centroid_geojson: string | null;
  distance_meters: number | null;
  inside_zone: boolean;
}

/**
 * Find buildings whose `zone` polygon contains the point, or whose map point
 * (explicit pin when set, else zone centroid) is within `radiusMeters` of it.
 * Results are ordered "inside-zone first, then by distance ascending".
 */
export const getNearbyBuildings = async (
  lat: number,
  lng: number,
  radiusMeters: number,
  limit = 5,
): Promise<NearbyBuildingRow[]> => {
  const rows = await prisma.$queryRaw<NearbyRawRow[]>`
    WITH pts AS (
      SELECT
        *,
        COALESCE(
          CASE WHEN "pinLat" IS NOT NULL AND "pinLng" IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint("pinLng", "pinLat"), 4326)
          END,
          centroid
        ) AS map_point
      FROM "Building"
    )
    SELECT
      id,
      code,
      name,
      description,
      "imageUrl" AS image_url,
      "pinLat" AS pin_lat,
      "pinLng" AS pin_lng,
      ST_AsGeoJSON(centroid) AS centroid_geojson,
      ST_Distance(
        map_point::geography,
        ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography
      ) AS distance_meters,
      COALESCE(
        ST_Contains(zone, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)),
        false
      ) AS inside_zone
    FROM pts
    WHERE map_point IS NOT NULL
      AND (
        ST_Contains(zone, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326))
        OR ST_DWithin(
          map_point::geography,
          ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography,
          ${radiusMeters}::float8
        )
      )
    ORDER BY inside_zone DESC, distance_meters ASC
    LIMIT ${limit};
  `;

  return rows.map((r) => {
    // Map coordinate contract: `centroid` is the building's map point — the
    // explicit pin when set, else the zone centroid (keeps the app field name).
    const centroid =
      r.pin_lat != null && r.pin_lng != null
        ? { lat: r.pin_lat, lng: r.pin_lng }
        : parseCentroid(r.centroid_geojson);
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      imageUrl: r.image_url,
      centroid,
      distanceMeters: r.distance_meters ?? Number.POSITIVE_INFINITY,
      insideZone: r.inside_zone,
    };
  });
};
