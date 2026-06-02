-- DropForeignKey
ALTER TABLE "WifiAccessPoint" DROP CONSTRAINT "WifiAccessPoint_buildingId_fkey";

-- AlterTable
ALTER TABLE "WifiAccessPoint" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "WifiAccessPoint" ADD CONSTRAINT "WifiAccessPoint_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
