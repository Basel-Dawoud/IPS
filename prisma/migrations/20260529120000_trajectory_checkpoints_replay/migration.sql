-- Trajectory collection: replay-fidelity + checkpoints + environment/sensor metadata + idempotency.
-- All new columns are nullable / no default change → existing rows are untouched.
-- Mirrors the additive style of 20260521150000_add_trajectory_collection.

-- B4 environment versioning + B5 carry mode/pose on the session.
ALTER TABLE "TrajectorySession" ADD COLUMN IF NOT EXISTS "buildingVersion"     INTEGER;
ALTER TABLE "TrajectorySession" ADD COLUMN IF NOT EXISTS "beaconLayoutVersion" INTEGER;
ALTER TABLE "TrajectorySession" ADD COLUMN IF NOT EXISTS "timeOfDay"           TEXT;
ALTER TABLE "TrajectorySession" ADD COLUMN IF NOT EXISTS "crowdLevel"          TEXT;
ALTER TABLE "TrajectorySession" ADD COLUMN IF NOT EXISTS "carryMode"           TEXT;
ALTER TABLE "TrajectorySession" ADD COLUMN IF NOT EXISTS "phoneAttitude"       TEXT;

-- B6 idempotency + B1 replay clock anchor + B5 sensor metadata on the walk.
ALTER TABLE "TrajectoryWalk" ADD COLUMN IF NOT EXISTS "clientId"      TEXT;
ALTER TABLE "TrajectoryWalk" ADD COLUMN IF NOT EXISTS "clockEpochMs"  DOUBLE PRECISION;
ALTER TABLE "TrajectoryWalk" ADD COLUMN IF NOT EXISTS "imuRateHz"     INTEGER;
ALTER TABLE "TrajectoryWalk" ADD COLUMN IF NOT EXISTS "magCalibrated" BOOLEAN;

-- (sessionId, clientId) unique so retried uploads don't duplicate. NULL clientId
-- rows (legacy) are treated as distinct by Postgres, so existing data is fine.
CREATE UNIQUE INDEX IF NOT EXISTS "TrajectoryWalk_sessionId_clientId_key"
  ON "TrajectoryWalk"("sessionId", "clientId");

-- B1 monotonic relative timestamp on every streamed row.
ALTER TABLE "TrajectoryStepEvent"  ADD COLUMN IF NOT EXISTS "tMs" DOUBLE PRECISION;
ALTER TABLE "TrajectoryImuSample"  ADD COLUMN IF NOT EXISTS "tMs" DOUBLE PRECISION;
ALTER TABLE "TrajectoryBleReading" ADD COLUMN IF NOT EXISTS "tMs" DOUBLE PRECISION;
ALTER TABLE "TrajectoryWifiReading" ADD COLUMN IF NOT EXISTS "tMs" DOUBLE PRECISION;

-- B2 checkpoint waypoints → piecewise-linear ground-truth labels.
CREATE TABLE IF NOT EXISTS "TrajectoryCheckpoint" (
  "id"         TEXT          NOT NULL,
  "walkId"     TEXT          NOT NULL,
  "seq"        INTEGER       NOT NULL,
  "x"          DOUBLE PRECISION NOT NULL,
  "y"          DOUBLE PRECISION NOT NULL,
  "tMs"        DOUBLE PRECISION NOT NULL,
  "capturedAt" TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "TrajectoryCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrajectoryCheckpoint_walkId_seq_idx"
  ON "TrajectoryCheckpoint"("walkId", "seq");

ALTER TABLE "TrajectoryCheckpoint"
  ADD CONSTRAINT "TrajectoryCheckpoint_walkId_fkey"
  FOREIGN KEY ("walkId")
  REFERENCES "TrajectoryWalk"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
