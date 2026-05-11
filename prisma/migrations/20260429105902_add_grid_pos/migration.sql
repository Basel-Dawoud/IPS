/*
  Warnings:

  - Added the required column `x` to the `RawRssiReading` table without a default value. This is not possible if the table is not empty.
  - Added the required column `y` to the `RawRssiReading` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RawRssiReading" ADD COLUMN     "x" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "y" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE INDEX "RawRssiReading_x_y_idx" ON "RawRssiReading"("x", "y");
