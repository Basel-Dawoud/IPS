-- AlterTable
ALTER TABLE "RawRssiReading" ADD COLUMN     "windowIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "RawRssiReading_fingerprintId_windowIndex_idx" ON "RawRssiReading"("fingerprintId", "windowIndex");
