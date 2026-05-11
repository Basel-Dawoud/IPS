-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "BleFingerprint" ADD COLUMN     "sampleIndex" INTEGER,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "FingerprintSession" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorLevel" INTEGER NOT NULL,
    "name" TEXT,
    "deviceModel" TEXT,
    "collectorId" TEXT,
    "gridSpacing" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FingerprintSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregatedFingerprint" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorLevel" INTEGER NOT NULL,
    "gridX" DOUBLE PRECISION NOT NULL,
    "gridY" DOUBLE PRECISION NOT NULL,
    "beaconUids" TEXT[],
    "rssiMeans" DOUBLE PRECISION[],
    "rssiStdDevs" DOUBLE PRECISION[],
    "sampleCount" INTEGER NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregatedFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FingerprintSession_buildingId_floorLevel_idx" ON "FingerprintSession"("buildingId", "floorLevel");

-- CreateIndex
CREATE INDEX "AggregatedFingerprint_buildingId_floorLevel_idx" ON "AggregatedFingerprint"("buildingId", "floorLevel");

-- CreateIndex
CREATE UNIQUE INDEX "AggregatedFingerprint_buildingId_floorLevel_gridX_gridY_key" ON "AggregatedFingerprint"("buildingId", "floorLevel", "gridX", "gridY");

-- CreateIndex
CREATE INDEX "BleFingerprint_sessionId_idx" ON "BleFingerprint"("sessionId");

-- AddForeignKey
ALTER TABLE "FingerprintSession" ADD CONSTRAINT "FingerprintSession_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BleFingerprint" ADD CONSTRAINT "BleFingerprint_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FingerprintSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AggregatedFingerprint" ADD CONSTRAINT "AggregatedFingerprint_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
