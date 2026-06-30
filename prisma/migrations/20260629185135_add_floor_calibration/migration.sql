-- Additive-only migration. Adds pixel↔meter calibration fields to "Floor".
-- Hand-written (not via `migrate dev`) to avoid the unrelated
-- TrajectorySession_buildingId FK drop and the cosmetic Poi.updatedAt default
-- drop that `migrate diff` also proposes -- neither is part of this change.

-- AlterTable
ALTER TABLE "Floor" ADD COLUMN     "imageHeightPx" INTEGER,
ADD COLUMN     "imageWidthPx" INTEGER,
ADD COLUMN     "metersPerPixel" DOUBLE PRECISION,
ADD COLUMN     "originXm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "originYm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "rotationDeg" INTEGER NOT NULL DEFAULT 0;
