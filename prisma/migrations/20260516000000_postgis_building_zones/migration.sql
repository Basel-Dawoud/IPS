-- Enable PostGIS (idempotent)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Building geofence columns: a polygon for the supported zone, and a
-- centroid point for distance-based ordering of nearby buildings.
ALTER TABLE "Building"
  ADD COLUMN IF NOT EXISTS "zone"     geometry(Polygon, 4326),
  ADD COLUMN IF NOT EXISTS "centroid" geometry(Point,   4326);

-- GIST indexes for fast spatial queries (ST_Contains, ST_DWithin).
CREATE INDEX IF NOT EXISTS "Building_zone_gist"     ON "Building" USING GIST ("zone");
CREATE INDEX IF NOT EXISTS "Building_centroid_gist" ON "Building" USING GIST ("centroid");
