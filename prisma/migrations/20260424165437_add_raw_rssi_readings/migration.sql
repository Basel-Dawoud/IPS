-- AlterTable
ALTER TABLE "BleFingerprint" ADD COLUMN     "durationMs" INTEGER;

-- CreateTable
CREATE TABLE "RawRssiReading" (
    "id" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "beaconUid" TEXT NOT NULL,
    "rssi" INTEGER NOT NULL,
    "t" INTEGER NOT NULL,

    CONSTRAINT "RawRssiReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawRssiReading_fingerprintId_idx" ON "RawRssiReading"("fingerprintId");

-- CreateIndex
CREATE INDEX "RawRssiReading_beaconUid_idx" ON "RawRssiReading"("beaconUid");

-- AddForeignKey
ALTER TABLE "RawRssiReading" ADD CONSTRAINT "RawRssiReading_fingerprintId_fkey" FOREIGN KEY ("fingerprintId") REFERENCES "BleFingerprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
