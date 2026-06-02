-- Sensor columns on RawRssiReading (all nullable — not all devices have every sensor)
ALTER TABLE "RawRssiReading"
  ADD COLUMN IF NOT EXISTS "accelX"           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "accelY"           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "accelZ"           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "userAccelX"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "userAccelY"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "userAccelZ"       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "magX"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "magY"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "magZ"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "pitch"            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "roll"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "yaw"              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "pressure"         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "relativeAltitude" DOUBLE PRECISION;

-- WifiAccessPoint: registered WiFi APs per building (admin-managed, mirrors BleBeacon)
CREATE TABLE IF NOT EXISTS "WifiAccessPoint" (
  "id"          TEXT          NOT NULL,
  "buildingId"  TEXT          NOT NULL,
  "bssid"       TEXT          NOT NULL,
  "ssid"        TEXT,
  "description" TEXT,
  "floorLevel"  INTEGER,
  "active"      BOOLEAN       NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WifiAccessPoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WifiAccessPoint_buildingId_bssid_key"
  ON "WifiAccessPoint"("buildingId", "bssid");

CREATE INDEX IF NOT EXISTS "WifiAccessPoint_buildingId_idx"
  ON "WifiAccessPoint"("buildingId");

ALTER TABLE "WifiAccessPoint"
  ADD CONSTRAINT "WifiAccessPoint_buildingId_fkey"
  FOREIGN KEY ("buildingId")
  REFERENCES "Building"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- WifiReading: per-fingerprint-window scan results (only registered APs, inserted on upload)
CREATE TABLE IF NOT EXISTS "WifiReading" (
  "id"            TEXT          NOT NULL,
  "fingerprintId" TEXT          NOT NULL,
  "bssid"         TEXT          NOT NULL,
  "ssid"          TEXT,
  "rssi"          INTEGER       NOT NULL,
  "frequencyMhz"  INTEGER,
  "capturedAt"    TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "WifiReading_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WifiReading_fingerprintId_idx"
  ON "WifiReading"("fingerprintId");

CREATE INDEX IF NOT EXISTS "WifiReading_bssid_idx"
  ON "WifiReading"("bssid");

ALTER TABLE "WifiReading"
  ADD CONSTRAINT "WifiReading_fingerprintId_fkey"
  FOREIGN KEY ("fingerprintId")
  REFERENCES "BleFingerprint"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
