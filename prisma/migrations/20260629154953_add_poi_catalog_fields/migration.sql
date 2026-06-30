-- Additive-only migration. Adds floor-plan extent fields to "Floor" and
-- catalog/chatbot metadata to "Poi". Hand-written (not via `migrate dev`) to
-- avoid the unrelated TrajectorySession_buildingId FK drop that `migrate diff`
-- proposes -- that FK is intentionally managed in raw SQL, not the Prisma model.

-- AlterTable
ALTER TABLE "Floor" ADD COLUMN     "heightMeters" DOUBLE PRECISION,
ADD COLUMN     "widthMeters" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Poi" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "category" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "productKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
