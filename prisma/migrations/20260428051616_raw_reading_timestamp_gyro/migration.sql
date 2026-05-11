/*
  Warnings:

  - You are about to drop the column `t` on the `RawRssiReading` table. All the data in the column will be lost.
  - Added the required column `capturedAt` to the `RawRssiReading` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FingerprintSession" ADD COLUMN     "pointDurationMs" INTEGER;

-- AlterTable
ALTER TABLE "RawRssiReading" DROP COLUMN "t",
ADD COLUMN     "capturedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "gyroX" DOUBLE PRECISION,
ADD COLUMN     "gyroY" DOUBLE PRECISION,
ADD COLUMN     "gyroZ" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "RawRssiReading_capturedAt_idx" ON "RawRssiReading"("capturedAt");
