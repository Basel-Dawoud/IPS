-- Trajectory-based fingerprinting (collection only)
-- Parallel pipeline to BleFingerprint. No edits to existing tables.

-- TrajectorySession: groups one collection run (analogous to FingerprintSession).
CREATE TABLE IF NOT EXISTS "TrajectorySession" (
  "id"          TEXT          NOT NULL,
  "buildingId"  TEXT          NOT NULL,
  "floorLevel"  INTEGER       NOT NULL,
  "name"        TEXT,
  "deviceModel" TEXT,
  "collectorId" TEXT,
  "notes"       TEXT,
  "status"      "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TrajectorySession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrajectorySession_buildingId_floorLevel_idx"
  ON "TrajectorySession"("buildingId", "floorLevel");

ALTER TABLE "TrajectorySession"
  ADD CONSTRAINT "TrajectorySession_buildingId_fkey"
  FOREIGN KEY ("buildingId")
  REFERENCES "Building"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;


-- TrajectoryWalk: one continuous walk between two waypoints.
CREATE TABLE IF NOT EXISTS "TrajectoryWalk" (
  "id"          TEXT          NOT NULL,
  "sessionId"   TEXT          NOT NULL,
  "buildingId"  TEXT          NOT NULL,
  "floorLevel"  INTEGER       NOT NULL,
  "startX"      DOUBLE PRECISION NOT NULL,
  "startY"      DOUBLE PRECISION NOT NULL,
  "endX"        DOUBLE PRECISION NOT NULL,
  "endY"        DOUBLE PRECISION NOT NULL,
  "startedAt"   TIMESTAMP(3)  NOT NULL,
  "endedAt"     TIMESTAMP(3)  NOT NULL,
  "totalSteps"  INTEGER       NOT NULL,
  "deviceModel" TEXT,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrajectoryWalk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrajectoryWalk_sessionId_idx"
  ON "TrajectoryWalk"("sessionId");

CREATE INDEX IF NOT EXISTS "TrajectoryWalk_buildingId_floorLevel_idx"
  ON "TrajectoryWalk"("buildingId", "floorLevel");

ALTER TABLE "TrajectoryWalk"
  ADD CONSTRAINT "TrajectoryWalk_sessionId_fkey"
  FOREIGN KEY ("sessionId")
  REFERENCES "TrajectorySession"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;


-- TrajectoryStepEvent: one detected footstep with server-interpolated label.
CREATE TABLE IF NOT EXISTS "TrajectoryStepEvent" (
  "id"            TEXT          NOT NULL,
  "walkId"        TEXT          NOT NULL,
  "stepIndex"     INTEGER       NOT NULL,
  "capturedAt"    TIMESTAMP(3)  NOT NULL,
  "headingRad"    DOUBLE PRECISION NOT NULL,
  "interpolatedX" DOUBLE PRECISION NOT NULL,
  "interpolatedY" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "TrajectoryStepEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrajectoryStepEvent_walkId_stepIndex_idx"
  ON "TrajectoryStepEvent"("walkId", "stepIndex");

ALTER TABLE "TrajectoryStepEvent"
  ADD CONSTRAINT "TrajectoryStepEvent_walkId_fkey"
  FOREIGN KEY ("walkId")
  REFERENCES "TrajectoryWalk"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;


-- TrajectoryImuSample: raw IMU stream (~20 Hz). All sensor fields nullable.
CREATE TABLE IF NOT EXISTS "TrajectoryImuSample" (
  "id"               TEXT          NOT NULL,
  "walkId"           TEXT          NOT NULL,
  "capturedAt"       TIMESTAMP(3)  NOT NULL,
  "gyroX"            DOUBLE PRECISION,
  "gyroY"            DOUBLE PRECISION,
  "gyroZ"            DOUBLE PRECISION,
  "accelX"           DOUBLE PRECISION,
  "accelY"           DOUBLE PRECISION,
  "accelZ"           DOUBLE PRECISION,
  "userAccelX"       DOUBLE PRECISION,
  "userAccelY"       DOUBLE PRECISION,
  "userAccelZ"       DOUBLE PRECISION,
  "magX"             DOUBLE PRECISION,
  "magY"             DOUBLE PRECISION,
  "magZ"             DOUBLE PRECISION,
  "pitch"            DOUBLE PRECISION,
  "roll"             DOUBLE PRECISION,
  "yaw"              DOUBLE PRECISION,
  "pressure"         DOUBLE PRECISION,
  "relativeAltitude" DOUBLE PRECISION,
  CONSTRAINT "TrajectoryImuSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrajectoryImuSample_walkId_capturedAt_idx"
  ON "TrajectoryImuSample"("walkId", "capturedAt");

ALTER TABLE "TrajectoryImuSample"
  ADD CONSTRAINT "TrajectoryImuSample_walkId_fkey"
  FOREIGN KEY ("walkId")
  REFERENCES "TrajectoryWalk"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;


-- TrajectoryBleReading: one BLE advertisement captured during the walk.
CREATE TABLE IF NOT EXISTS "TrajectoryBleReading" (
  "id"         TEXT          NOT NULL,
  "walkId"     TEXT          NOT NULL,
  "capturedAt" TIMESTAMP(3)  NOT NULL,
  "beaconUid"  TEXT          NOT NULL,
  "rssi"       INTEGER       NOT NULL,
  CONSTRAINT "TrajectoryBleReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrajectoryBleReading_walkId_capturedAt_idx"
  ON "TrajectoryBleReading"("walkId", "capturedAt");

CREATE INDEX IF NOT EXISTS "TrajectoryBleReading_walkId_beaconUid_idx"
  ON "TrajectoryBleReading"("walkId", "beaconUid");

ALTER TABLE "TrajectoryBleReading"
  ADD CONSTRAINT "TrajectoryBleReading_walkId_fkey"
  FOREIGN KEY ("walkId")
  REFERENCES "TrajectoryWalk"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;


-- TrajectoryWifiReading: one WiFi scan entry captured during the walk.
CREATE TABLE IF NOT EXISTS "TrajectoryWifiReading" (
  "id"           TEXT          NOT NULL,
  "walkId"       TEXT          NOT NULL,
  "capturedAt"   TIMESTAMP(3)  NOT NULL,
  "bssid"        TEXT          NOT NULL,
  "ssid"         TEXT,
  "rssi"         INTEGER       NOT NULL,
  "frequencyMhz" INTEGER,
  CONSTRAINT "TrajectoryWifiReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrajectoryWifiReading_walkId_capturedAt_idx"
  ON "TrajectoryWifiReading"("walkId", "capturedAt");

CREATE INDEX IF NOT EXISTS "TrajectoryWifiReading_walkId_bssid_idx"
  ON "TrajectoryWifiReading"("walkId", "bssid");

ALTER TABLE "TrajectoryWifiReading"
  ADD CONSTRAINT "TrajectoryWifiReading_walkId_fkey"
  FOREIGN KEY ("walkId")
  REFERENCES "TrajectoryWalk"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
