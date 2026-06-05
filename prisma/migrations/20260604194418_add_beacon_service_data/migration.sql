-- AlterTable: cross-platform key (0xFFF0 service-data hex) for iOS beacon lookup.
ALTER TABLE "BleBeacon" ADD COLUMN IF NOT EXISTS "serviceData" TEXT;
