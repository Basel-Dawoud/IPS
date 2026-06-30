-- Additive-only: vector floor map (rooms/walls polygons) derived from a grid.
-- Hand-written to avoid the unrelated TrajectorySession FK drop and Poi default drop.

-- AlterTable
ALTER TABLE "Floor" ADD COLUMN     "vectorMap" JSONB;
