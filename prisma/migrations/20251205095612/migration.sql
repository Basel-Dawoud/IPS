-- CreateEnum
CREATE TYPE "MapNodeType" AS ENUM ('CORRIDOR', 'ROOM_ENTRANCE', 'STAIRS', 'ELEVATOR');

-- CreateEnum
CREATE TYPE "PoiType" AS ENUM ('ROOM', 'LAB', 'TOILET', 'STAIRS', 'ELEVATOR', 'OTHER');

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "mapUrl" TEXT,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BleBeacon" (
    "id" TEXT NOT NULL,
    "beaconUid" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorLevel" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "txPowerDbm" DOUBLE PRECISION,
    "refRssi1mDbm" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BleBeacon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BleEnvModel" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorLevel" INTEGER,
    "nExponent" DOUBLE PRECISION NOT NULL,
    "shadowSigma" DOUBLE PRECISION,
    "lastCalibratedAt" TIMESTAMP(3),

    CONSTRAINT "BleEnvModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BleFingerprint" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorLevel" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "beaconUids" TEXT[],
    "rssis" INTEGER[],
    "deviceModel" TEXT,
    "layoutTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BleFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorHint" INTEGER,
    "deviceId" TEXT,
    "method" TEXT,
    "beaconUids" TEXT[],
    "rssis" INTEGER[],
    "estX" DOUBLE PRECISION,
    "estY" DOUBLE PRECISION,
    "estFloor" INTEGER,
    "accuracyM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapNode" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorLevel" INTEGER NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "type" "MapNodeType" NOT NULL,
    "poiId" TEXT,

    CONSTRAINT "MapNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapEdge" (
    "id" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "bidirectional" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MapEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poi" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorLevel" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "PoiType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Poi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Building_code_key" ON "Building"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_buildingId_level_key" ON "Floor"("buildingId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "BleBeacon_beaconUid_key" ON "BleBeacon"("beaconUid");

-- CreateIndex
CREATE INDEX "BleBeacon_buildingId_floorLevel_idx" ON "BleBeacon"("buildingId", "floorLevel");

-- CreateIndex
CREATE UNIQUE INDEX "BleEnvModel_buildingId_floorLevel_key" ON "BleEnvModel"("buildingId", "floorLevel");

-- CreateIndex
CREATE INDEX "BleFingerprint_buildingId_floorLevel_idx" ON "BleFingerprint"("buildingId", "floorLevel");

-- CreateIndex
CREATE INDEX "Measurement_buildingId_createdAt_idx" ON "Measurement"("buildingId", "createdAt");

-- CreateIndex
CREATE INDEX "MapNode_buildingId_floorLevel_idx" ON "MapNode"("buildingId", "floorLevel");

-- CreateIndex
CREATE INDEX "Poi_buildingId_floorLevel_idx" ON "Poi"("buildingId", "floorLevel");

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BleBeacon" ADD CONSTRAINT "BleBeacon_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BleEnvModel" ADD CONSTRAINT "BleEnvModel_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BleFingerprint" ADD CONSTRAINT "BleFingerprint_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapNode" ADD CONSTRAINT "MapNode_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapNode" ADD CONSTRAINT "MapNode_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "Poi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapEdge" ADD CONSTRAINT "MapEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "MapNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapEdge" ADD CONSTRAINT "MapEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "MapNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poi" ADD CONSTRAINT "Poi_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
