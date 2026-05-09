CREATE TABLE IF NOT EXISTS device_positions (
    id          SERIAL PRIMARY KEY,
    device_id   TEXT             NOT NULL,
    building_id TEXT             NOT NULL,
    floor       INT              NOT NULL,
    x           DOUBLE PRECISION NOT NULL,
    y           DOUBLE PRECISION NOT NULL,
    ts          TIMESTAMPTZ      NOT NULL
);