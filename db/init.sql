CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS device_positions (
    ts          TIMESTAMPTZ      NOT NULL,
    id          BIGINT           GENERATED ALWAYS AS IDENTITY,
    device_id   TEXT             NOT NULL,
    building_id TEXT             NOT NULL,
    floor       INTEGER          NOT NULL,
    zone_id     TEXT,                        -- nullable: matches MQTT contract, not always known
    room_id     TEXT,                        -- nullable: nearest store/room, see db/02-rooms.sql
    corridor_segment_id TEXT,                 -- nullable: which corridor heatmap tile, derived
                                               -- server-side (never sent by the client) — see
                                               -- corridor_segment_id_for() in server/main.py
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

CREATE INDEX IF NOT EXISTS idx_device_positions_room_ts
    ON device_positions (room_id, ts DESC)
    WHERE room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_positions_corridor_ts
    ON device_positions (corridor_segment_id, ts DESC)
    WHERE corridor_segment_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- Analytics — continuous aggregates
--
-- These were documented as planned in server/main.py for several iterations
-- ("GET /analytics/heatmap -> crowd_analytics continuous aggregate") but never
-- actually created. This is that implementation.
--
-- A continuous aggregate is a materialized view TimescaleDB keeps
-- incrementally up to date in the background — querying it is a simple
-- indexed read against pre-computed buckets, not a live scan of
-- device_positions, so dashboard analytics stay fast even as history grows
-- to millions of rows.
-- ════════════════════════════════════════════════════════════════════════════

-- Per-floor occupancy, bucketed every 5 minutes. Powers the dashboard's
-- occupancy-over-time chart and the floor heatmap's overall intensity scale.
CREATE MATERIALIZED VIEW IF NOT EXISTS crowd_analytics
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', ts) AS bucket,
    building_id,
    floor,
    COUNT(DISTINCT device_id)    AS device_count
FROM device_positions
GROUP BY bucket, building_id, floor
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'crowd_analytics',
    start_offset      => INTERVAL '1 hour',
    end_offset        => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists     => TRUE
);

-- Per-room foot traffic, bucketed every 5 minutes. Powers the dashboard's
-- "most visited stores" ranking and per-room heatmap tinting. NULL room_id
-- rows (device in the corridor but not near any labeled room — e.g. floor 4's
-- unlabeled blocks) are excluded; this aggregate is specifically store traffic.
CREATE MATERIALIZED VIEW IF NOT EXISTS room_visits
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', ts) AS bucket,
    building_id,
    floor,
    room_id,
    COUNT(DISTINCT device_id)    AS visit_count
FROM device_positions
WHERE room_id IS NOT NULL
GROUP BY bucket, building_id, floor, room_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'room_visits',
    start_offset      => INTERVAL '1 hour',
    end_offset        => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists     => TRUE
);

-- Per-corridor-segment foot traffic, bucketed every 5 minutes. Powers the
-- corridor heatmap tint on the dashboard/analytics pages — the corridor's
-- own floor surface, not the shops beside it. corridor_segment_id is
-- derived server-side from x/y (see corridor_segment_id_for() in
-- server/main.py), never sent by the client. NULL rows (uncalibrated
-- floor, or — relevant only if CORRIDOR_ONLY=false is ever used — a
-- sample that's genuinely inside a room, not the corridor) are excluded,
-- the same pattern room_visits uses for NULL room_id.
CREATE MATERIALIZED VIEW IF NOT EXISTS corridor_visits
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', ts) AS bucket,
    building_id,
    floor,
    corridor_segment_id,
    COUNT(DISTINCT device_id)    AS visit_count
FROM device_positions
WHERE corridor_segment_id IS NOT NULL
GROUP BY bucket, building_id, floor, corridor_segment_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'corridor_visits',
    start_offset      => INTERVAL '1 hour',
    end_offset        => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists     => TRUE
);

-- Retention: keep raw position history for 30 days, after which only the
-- continuous aggregates above (which are not affected by this policy) remain.
-- Commented out by default — uncomment once you have agreed on a retention
-- window for the GP report; until then, keep everything for analysis.
-- SELECT add_retention_policy('device_positions', INTERVAL '30 days', if_not_exists => TRUE);