CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS device_positions (
    ts          TIMESTAMPTZ      NOT NULL,
    id          BIGINT           GENERATED ALWAYS AS IDENTITY,
    device_id   TEXT             NOT NULL,
    building_id TEXT             NOT NULL,
    floor       INTEGER          NOT NULL,
    zone_id     TEXT,                        -- nullable: matches MQTT contract, not always known
    x           DOUBLE PRECISION NOT NULL,
    y           DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (ts, id)
);

SELECT create_hypertable(
    'device_positions',
    'ts',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_device_positions_device_ts
    ON device_positions (device_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_device_positions_building_floor_ts
    ON device_positions (building_id, floor, ts DESC);