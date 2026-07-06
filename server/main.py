# server/main.py
# IPS backend server.
#
# Responsibilities:
#   - Subscribe to MQTT position/status topics
#   - Write live state to Redis        (latest position/status per device)
#   - Write full history to TimescaleDB (every position, for analytics)
#   - Publish ACKs back to the device
#   - Broadcast live updates to connected dashboards over WebSocket
#   - Detect per-room crowding from live state and alert both the affected
#     devices (MQTT "emergency" push) and connected dashboards (WS "alert")
#   - Serve REST endpoints for floor metadata and history
#
# Contract: docs/MQTT_CONTRACT.md (v1.4)
#   - position: qos=0, retain=false  → live state belongs in Redis, not the broker
#   - status:   qos=1, retain=true   → last heartbeat visible immediately
#   - command:  qos=1, retain=false  → ACKs/alerts must arrive, never replayed
#   - alert:    qos=1, retain=false  → server → device, payload shape in
#                                       docs/MOBILE_APP_MQTT_RULES.md
#
# Dashboard note:
#   The dashboard reads live state via WebSocket (/ws/live), backed by
#   Redis and pushed event-driven (on MQTT arrival), not on a timer. It
#   gets one full snapshot on connect, then incremental position/status/
#   alert updates as they happen. It no longer needs direct MQTT broker access.

import asyncio
import json
import logging
import os
import time
import traceback
from contextlib import asynccontextmanager

import aiomqtt
import asyncpg
import redis.asyncio as redis
from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger("ips.server")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ── Config ────────────────────────────────────────────────────────────────────
MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"

# How long a live key survives in Redis with no update. After this, a device
# is considered stale and drops out of /live/positions naturally via TTL.
LIVE_KEY_TTL_SECONDS = int(os.getenv("LIVE_KEY_TTL_SECONDS", "180"))

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "ipsdb")
POSTGRES_USER = os.getenv("POSTGRES_USER", "ipsuser")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "ipspass")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DSN = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

# Comma-separated list — e.g. "http://localhost:8080,http://192.168.1.50:8080"
#
# IMPORTANT: the browser's Origin header must match one of these EXACTLY,
# including scheme and port — "http://localhost:8080" and
# "http://127.0.0.1:8080" are two *different* origins to a browser, even
# though they reach the same machine. Opening the dashboard from whichever
# one isn't allow-listed is the most common real cause of "CORS blocked"
# errors, so both loopback forms are allowed by default. Add your demo-day
# host/IP too before presenting from anywhere other than localhost, or
# requests from that origin will be silently blocked by the browser with
# no error in the server logs.
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080",
    ).split(",")
    if origin.strip()
]

# Sampling is an OPTIONAL future optimization, OFF by default.
# When enabled, only 1-in-N position messages would be written to Postgres
# (Redis and the dashboard broadcast always get every message regardless).
# Do not turn this on until write volume actually becomes a problem.
HISTORY_SAMPLING_ENABLED = os.getenv("HISTORY_SAMPLING_ENABLED", "false").lower() == "true"
HISTORY_SAMPLING_RATE = int(os.getenv("HISTORY_SAMPLING_RATE", "1"))

FLOORS_CONFIG_PATH = os.getenv(
    "FLOORS_CONFIG_PATH",
    os.path.join(os.path.dirname(__file__), "floors.json"),
)

# ── Crowd alerting ──────────────────────────────────────────────────────────
# A room whose live occupant count reaches CROWD_ALERT_THRESHOLD triggers:
#   - an MQTT push to every device currently in that room, on its own
#     ips/<building_id>/device/<device_id>/alert topic, using the payload
#     shape already documented in docs/MOBILE_APP_MQTT_RULES.md
#     ({"type": "emergency", "message": ..., "ts": ...}) — this is the
#     existing mobile contract, not a new one invented here.
#   - a WS broadcast to every connected dashboard, both on the "warning"
#     onset AND the "clear" resolution. The dashboard is a monitoring
#     surface, not a phone doing a full-screen emergency takeover, so it
#     gets a richer message shape than the MQTT one, and gets told about
#     both transitions.
# CROWD_ALERT_HYSTERESIS keeps a room from flapping alert/clear every poll
# when its live count sits right at the threshold: it must fall to
# (threshold - hysteresis) before an active alert clears.
CROWD_ALERT_THRESHOLD = int(os.getenv("CROWD_ALERT_THRESHOLD", "8"))
CROWD_ALERT_CHECK_INTERVAL_SECONDS = float(os.getenv("CROWD_ALERT_CHECK_INTERVAL_SECONDS", "3"))
CROWD_ALERT_HYSTERESIS = 2

# ── Globals (set during lifespan startup) ─────────────────────────────────────
pg_pool: asyncpg.Pool | None = None
redis_client: redis.Redis | None = None
mqtt_connected = False  # flipped by mqtt_loop — see /health
mqtt_client_ref: aiomqtt.Client | None = None  # set by mqtt_loop while connected; crowd_alert_loop publishes through it

REQUIRED_POSITION_FIELDS = {"device_id", "building_id", "floor", "x", "y"}
REQUIRED_STATUS_FIELDS = {"device_id"}

ACTIVE_DEVICES_SET = "live:devices"
_position_counter = 0  # only used if HISTORY_SAMPLING_ENABLED
_room_alert_state: dict[str, dict] = {}  # "building_id:room_id" -> alert record, present only while alerting

with open(FLOORS_CONFIG_PATH) as f:
    FLOORS_CONFIG = json.load(f)

# Precomputed once at import time: (floor, room_id) -> display name, so the
# alert path doesn't re-scan FLOORS_CONFIG on every check.
ROOM_NAME_BY_FLOOR: dict[int, dict[str, str]] = {
    int(floor_key): {room["id"]: room["name"] for room in cfg.get("rooms", [])}
    for floor_key, cfg in FLOORS_CONFIG.items()
}


def room_name(floor: int, room_id: str) -> str:
    return ROOM_NAME_BY_FLOOR.get(floor, {}).get(room_id, room_id)


def position_key(device_id: str) -> str:
    return f"live:position:{device_id}"


def status_key(device_id: str) -> str:
    return f"live:status:{device_id}"


# ── WebSocket connection manager ───────────────────────────────────────────────

class ConnectionManager:
    """
    Tracks connected dashboards and pushes updates as they happen.
    No polling loop — broadcast() is called directly from handle_message()
    the moment a new position/status arrives from MQTT.
    """

    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active:
            self.active.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ── Redis writes (live state) ─────────────────────────────────────────────────

async def save_position_to_redis(data: dict) -> None:
    """
    Overwrite the latest known position for this device.
    TTL means a device that stops publishing disappears from /live/positions
    automatically — no manual cleanup needed.
    """
    device_id = data["device_id"]
    await redis_client.set(position_key(device_id), json.dumps(data), ex=LIVE_KEY_TTL_SECONDS)
    await redis_client.sadd(ACTIVE_DEVICES_SET, device_id)


async def save_status_to_redis(data: dict) -> None:
    device_id = data["device_id"]
    await redis_client.set(status_key(device_id), json.dumps(data), ex=LIVE_KEY_TTL_SECONDS)
    await redis_client.sadd(ACTIVE_DEVICES_SET, device_id)


# ── PostgreSQL writes (history) ────────────────────────────────────────────────

async def save_position_to_postgres(data: dict) -> None:
    """
    Insert one row into the device_positions hypertable.
    zone_id and room_id are both optional — stored as NULL if absent.
    room_id (nearest store/room, from phone.py's floors.json lookup) feeds
    the room_visits continuous aggregate used by /analytics/rooms.
    """
    async with pg_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO device_positions
                (ts, device_id, building_id, floor, zone_id, room_id, x, y)
            VALUES
                (to_timestamp($1), $2, $3, $4, $5, $6, $7, $8)
            """,
            int(data.get("ts", time.time())),
            data["device_id"],
            data["building_id"],
            data["floor"],
            data.get("zone_id"),
            data.get("room_id"),
            data["x"],
            data["y"],
        )


def should_write_to_history() -> bool:
    if not HISTORY_SAMPLING_ENABLED:
        return True
    global _position_counter
    _position_counter += 1
    return _position_counter % HISTORY_SAMPLING_RATE == 0


# ── MQTT publish helpers ───────────────────────────────────────────────────────

async def publish_ack(client: aiomqtt.Client, data: dict, status: str) -> None:
    reply_topic = f'ips/{data["building_id"]}/device/{data["device_id"]}/command'
    reply = {
        "type": "ack",
        "status": status,
        "device_id": data["device_id"],
        "ts": int(time.time()),
    }
    await client.publish(reply_topic, json.dumps(reply), qos=1, retain=False)


# ── MQTT message handling ──────────────────────────────────────────────────────

async def handle_message(client: aiomqtt.Client, message: aiomqtt.Message) -> None:
    topic = str(message.topic)

    try:
        data = json.loads(message.payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"[MQTT] Bad payload on {topic}, skipping: {e}")
        return

    if topic.endswith("/position"):
        if not REQUIRED_POSITION_FIELDS.issubset(data):
            logger.warning(f"[MQTT] Missing fields in position payload, skipping: {data}")
            return

        # Live state is the part that must succeed for the ack to say "stored".
        try:
            await save_position_to_redis(data)
        except Exception as e:
            logger.error(f"[REDIS] Write failed for {data.get('device_id')}: {e}")
            await publish_ack(client, data, "error")
            return

        # Live state is correct now — tell connected dashboards immediately.
        await manager.broadcast({"type": "position", **data})

        # History write is best-effort. A failure here is logged but does
        # NOT flip the ack to "error" — the live pipeline already succeeded,
        # only the analytics record is missing for this one sample.
        if should_write_to_history():
            try:
                await save_position_to_postgres(data)
            except Exception as e:
                logger.warning(f"[POSTGRES] History write failed for {data.get('device_id')}: {e}")

        await publish_ack(client, data, "stored")

    elif topic.endswith("/status"):
        if not REQUIRED_STATUS_FIELDS.issubset(data):
            logger.warning(f"[MQTT] Missing fields in status payload, skipping: {data}")
            return

        try:
            await save_status_to_redis(data)
        except Exception as e:
            logger.error(f"[REDIS] Write failed for {data.get('device_id')}: {e}")
            await publish_ack(client, data, "error")
            return

        await manager.broadcast({"type": "status", **data})
        await publish_ack(client, data, "status-updated")

    else:
        logger.warning(f"[MQTT] Unhandled topic: {topic}")


# ── MQTT loop ───────────────────────────────────────────────────────────────────

async def mqtt_loop() -> None:
    global mqtt_connected, mqtt_client_ref
    while True:
        try:
            logger.info("[MQTT] Connecting to broker...")
            async with aiomqtt.Client(MQTT_HOST, port=1883) as client:
                await client.subscribe("ips/+/device/+/position", qos=0)
                await client.subscribe("ips/+/device/+/status", qos=1)
                mqtt_connected = True
                mqtt_client_ref = client
                logger.info("[MQTT] Subscribed to position and status topics.")

                async for message in client.messages:
                    await handle_message(client, message)

        except Exception as e:
            mqtt_connected = False
            mqtt_client_ref = None
            logger.error(f"[MQTT] Error: {e}. Reconnecting in 5s...")
            await asyncio.sleep(5)


# ── Live snapshot (used once, on WebSocket connect) ────────────────────────────

async def fetch_live_positions() -> dict:
    """
    Current position of every device known to be active. Source: Redis.
    Self-prunes device_ids whose position key has already expired via TTL.
    """
    device_ids = sorted(await redis_client.smembers(ACTIVE_DEVICES_SET))

    if not device_ids:
        return {"count": 0, "items": []}

    keys = [position_key(device_id) for device_id in device_ids]
    raw_values = await redis_client.mget(keys)

    items = []
    stale_ids = []
    for device_id, raw in zip(device_ids, raw_values):
        if raw:
            items.append(json.loads(raw))
        else:
            stale_ids.append(device_id)

    if stale_ids:
        await redis_client.srem(ACTIVE_DEVICES_SET, *stale_ids)

    items.sort(key=lambda item: int(item.get("ts", 0)), reverse=True)
    return {"count": len(items), "items": items}


# ── Crowd alerting ─────────────────────────────────────────────────────────────

async def _publish_emergency_to_room(
    room_id: str, floor: int, count: int, device_ids: list[str], building_id: str
) -> None:
    """
    MQTT push to every device currently in a newly-crowded room. Matches the
    alert payload already documented in docs/MOBILE_APP_MQTT_RULES.md —
    {"type": "emergency", "message": ..., "ts": ...} — so an existing mobile
    client needs no new handling to receive this; extra fields beyond that
    are additive and safe for any client that ignores unknown keys.
    """
    if mqtt_client_ref is None:
        return
    name = room_name(floor, room_id)
    payload = json.dumps({
        "type": "emergency",
        "message": f"Crowding detected in {name} — {count} people currently present.",
        "room_id": room_id,
        "floor": floor,
        "count": count,
        "threshold": CROWD_ALERT_THRESHOLD,
        "ts": int(time.time()),
    })
    for device_id in device_ids:
        topic = f"ips/{building_id}/device/{device_id}/alert"
        try:
            await mqtt_client_ref.publish(topic, payload, qos=1, retain=False)
        except Exception as e:
            logger.error(f"[ALERT] Failed to publish emergency to {device_id}: {e}")


async def check_crowd_alerts() -> None:
    """
    One pass: group current live positions by room (reusing the same Redis
    snapshot /live/positions already serves — no new state store), compare
    each room's live occupant count against CROWD_ALERT_THRESHOLD, and act
    only on state *transitions*, not every poll. Without that, a room
    sitting above threshold would re-broadcast and re-publish on every
    single CROWD_ALERT_CHECK_INTERVAL_SECONDS tick — this fires once when a
    room becomes crowded, and once when it recovers.
    """
    live = await fetch_live_positions()

    rooms: dict[str, dict] = {}
    for item in live["items"]:
        room_id = item.get("room_id")
        if not room_id:
            continue
        key = f'{item["building_id"]}:{room_id}'
        bucket = rooms.setdefault(key, {
            "building_id": item["building_id"],
            "room_id": room_id,
            "floor": item["floor"],
            "device_ids": [],
        })
        bucket["device_ids"].append(item["device_id"])

    # Union with existing alert state so a room that just emptied out
    # entirely (no longer in `rooms` at all) still gets evaluated for clearing.
    for key in set(rooms.keys()) | set(_room_alert_state.keys()):
        bucket = rooms.get(key)
        count = len(bucket["device_ids"]) if bucket else 0
        was_alerting = key in _room_alert_state

        if not was_alerting and count >= CROWD_ALERT_THRESHOLD:
            room_id, floor, building_id = bucket["room_id"], bucket["floor"], bucket["building_id"]
            record = {
                "room_id": room_id,
                "floor": floor,
                "building_id": building_id,
                "room_name": room_name(floor, room_id),
                "count": count,
                "threshold": CROWD_ALERT_THRESHOLD,
                "ts": int(time.time()),
            }
            _room_alert_state[key] = record
            logger.warning(f"[ALERT] Room {room_id} (floor {floor}) crowded: {count} devices")
            await manager.broadcast({"type": "alert", "level": "warning", **record})
            await _publish_emergency_to_room(room_id, floor, count, bucket["device_ids"], building_id)

        elif was_alerting and count <= max(0, CROWD_ALERT_THRESHOLD - CROWD_ALERT_HYSTERESIS):
            record = {**_room_alert_state.pop(key), "count": count, "ts": int(time.time())}
            logger.info(f"[ALERT] Room {record['room_id']} back to normal: {count} devices")
            await manager.broadcast({"type": "alert", "level": "clear", **record})

        elif was_alerting and bucket is not None:
            # Still alerting — refresh the live count so a dashboard that
            # connects mid-alert (via the /ws/live snapshot) sees the
            # current number, not the count that originally tripped it.
            _room_alert_state[key]["count"] = count


async def crowd_alert_loop() -> None:
    while True:
        try:
            await check_crowd_alerts()
        except Exception as e:
            logger.error(f"[ALERT] check_crowd_alerts failed: {e}")
        await asyncio.sleep(CROWD_ALERT_CHECK_INTERVAL_SECONDS)


# ── Lifespan ─────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool, redis_client

    for attempt in range(5):
        try:
            pg_pool = await asyncpg.create_pool(POSTGRES_DSN, min_size=1, max_size=5)
            logger.info("[POSTGRES] Pool created.")
            break
        except Exception as e:
            logger.warning(f"[POSTGRES] Not ready (attempt {attempt + 1}/5): {e}")
            await asyncio.sleep(3)
    else:
        raise RuntimeError("Could not connect to PostgreSQL after 5 attempts.")

    for attempt in range(5):
        try:
            redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            logger.info("[REDIS] Client connected.")
            break
        except Exception as e:
            logger.warning(f"[REDIS] Not ready (attempt {attempt + 1}/5): {e}")
            await asyncio.sleep(3)
    else:
        raise RuntimeError("Could not connect to Redis after 5 attempts.")

    task = asyncio.create_task(mqtt_loop(), name="mqtt_loop")
    alert_task = asyncio.create_task(crowd_alert_loop(), name="crowd_alert_loop")

    try:
        yield
    finally:
        task.cancel()
        alert_task.cancel()
        await asyncio.gather(task, alert_task, return_exceptions=True)

        await pg_pool.close()
        logger.info("[POSTGRES] Pool closed.")

        close = getattr(redis_client, "aclose", None)
        if callable(close):
            await close()
        logger.info("[REDIS] Client closed.")


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """
    Subsystem connectivity for the dashboard's status strip.
    mqtt_connected reflects the live subscribe loop's current state.
    redis_connected/postgres_connected reflect whether the pool was
    established at startup — not a live ping on every request.
    """
    return {
        "status": "ok",
        "mqtt_connected": mqtt_connected,
        "redis_connected": redis_client is not None,
        "postgres_connected": pg_pool is not None,
    }


@app.get("/floors")
async def floors():
    """
    Single source of truth for floor metadata: grid dimensions, the
    background image to load, and the meters_per_cell calibration value
    (null until someone calibrates it via the dashboard's hover tool and
    edits server/floors.json).
    """
    return FLOORS_CONFIG


@app.get("/live/positions")
async def live_positions():
    """REST snapshot — same data the WebSocket sends on connect, for debugging."""
    return await fetch_live_positions()


@app.get("/live/status/{device_id}")
async def live_status(device_id: str):
    """Latest heartbeat for one device. Source: Redis."""
    raw = await redis_client.get(status_key(device_id))
    if raw is None:
        return {"device_id": device_id, "found": False}
    return {"device_id": device_id, "found": True, "status": json.loads(raw)}


@app.get("/alerts/active")
async def alerts_active():
    """
    Currently-crowded rooms, per check_crowd_alerts(). In-memory — resets on
    server restart, same as the rest of the live (non-history) state. This
    is the same data a dashboard already gets pushed via /ws/live's
    snapshot-on-connect and live "alert" broadcasts; exposed as REST too for
    debugging and for anything that wants a point-in-time read without
    opening a WebSocket.
    """
    return {"count": len(_room_alert_state), "items": list(_room_alert_state.values())}


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    """
    Push-only endpoint. Sends one full snapshot on connect — live positions
    plus any currently-active crowd alerts, so a dashboard that connects (or
    reconnects) mid-alert sees it immediately rather than waiting for the
    next state transition — then incremental position/status/alert updates
    via ConnectionManager.broadcast() as MQTT events or crowd_alert_loop
    transitions arrive. There is no timer here, broadcast() is called
    directly from handle_message() and check_crowd_alerts().

    This coroutine itself does nothing but wait for the client to disconnect.
    It never expects or processes inbound messages, so it uses receive()
    rather than receive_text() — no assumption about frame type, just a
    passive wait that raises WebSocketDisconnect when the client goes away.
    """
    await manager.connect(websocket)
    try:
        snapshot = await fetch_live_positions()
        await websocket.send_json({
            "type": "snapshot",
            "items": snapshot["items"],
            "active_alerts": list(_room_alert_state.values()),
        })

        while True:
            await websocket.receive()

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)


@app.get("/history/device/{device_id}")
async def device_history(
    device_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
):
    """Position history for one device, most recent first. Source: TimescaleDB."""
    async with pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT ts, device_id, building_id, floor, zone_id, room_id, x, y
            FROM device_positions
            WHERE device_id = $1
            ORDER BY ts DESC
            LIMIT $2
            """,
            device_id,
            limit,
        )
    return {"device_id": device_id, "count": len(rows), "items": [dict(r) for r in rows]}


@app.get("/rooms")
async def rooms(floor: int | None = Query(default=None)):
    """
    Static room directory: id, name, and grid bounding box per room.
    Source: server/floors.json (same data baked into the SVG labels and
    seeded into the Postgres `rooms` table by tools/render_floor_maps.py).
    Pass ?floor=3 to filter to one floor.
    """
    result = []
    for floor_key, cfg in FLOORS_CONFIG.items():
        if floor is not None and int(floor_key) != floor:
            continue
        for room in cfg.get("rooms", []):
            result.append({**room, "floor": int(floor_key)})
    return {"count": len(result), "items": result}


@app.get("/analytics/floor/{floor}")
async def analytics_floor_occupancy(
    floor: int,
    minutes: int = Query(default=60, ge=5, le=1440),
):
    """
    Occupancy time series for one floor over the last `minutes`, bucketed
    every 5 minutes. Source: crowd_analytics continuous aggregate.
    Powers the dashboard's occupancy-over-time chart.
    """
    async with pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT bucket, device_count
            FROM crowd_analytics
            WHERE floor = $1
              AND bucket >= NOW() - ($2 || ' minutes')::interval
            ORDER BY bucket ASC
            """,
            floor,
            str(minutes),
        )
    return {
        "floor": floor,
        "minutes": minutes,
        "items": [{"bucket": r["bucket"].isoformat(), "device_count": r["device_count"]} for r in rows],
    }


@app.get("/analytics/rooms")
async def analytics_room_traffic(
    floor: int | None = Query(default=None),
    minutes: int = Query(default=60, ge=5, le=1440),
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Per-room visit counts over the last `minutes`, summed across buckets and
    ranked highest first. Source: room_visits continuous aggregate, joined
    against the rooms table for display names.
    Powers the dashboard's "most visited stores" panel.
    """
    async with pg_pool.acquire() as conn:
        if floor is not None:
            rows = await conn.fetch(
                """
                SELECT rv.room_id, r.name, rv.floor, SUM(rv.visit_count) AS total_visits
                FROM room_visits rv
                JOIN rooms r ON r.room_id = rv.room_id
                WHERE rv.bucket >= NOW() - ($1 || ' minutes')::interval
                  AND rv.floor = $2
                GROUP BY rv.room_id, r.name, rv.floor
                ORDER BY total_visits DESC
                LIMIT $3
                """,
                str(minutes), floor, limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT rv.room_id, r.name, rv.floor, SUM(rv.visit_count) AS total_visits
                FROM room_visits rv
                JOIN rooms r ON r.room_id = rv.room_id
                WHERE rv.bucket >= NOW() - ($1 || ' minutes')::interval
                GROUP BY rv.room_id, r.name, rv.floor
                ORDER BY total_visits DESC
                LIMIT $2
                """,
                str(minutes), limit,
            )
    return {
        "minutes": minutes,
        "items": [
            {
                "room_id": r["room_id"],
                "name": r["name"],
                "floor": r["floor"],
                "total_visits": int(r["total_visits"]),
            }
            for r in rows
        ],
    }


@app.get("/analytics/heatmap")
async def analytics_heatmap(
    floor: int = Query(...),
    minutes: int = Query(default=60, ge=5, le=1440),
):
    """
    Per-room visit intensity for one floor, normalized 0-1 against the
    busiest room in the window. Source: room_visits continuous aggregate.
    The dashboard tints each room's bounding box (from /rooms) using this
    intensity when "heatmap mode" is toggled on.
    """
    async with pg_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT room_id, SUM(visit_count) AS total_visits
            FROM room_visits
            WHERE floor = $1
              AND bucket >= NOW() - ($2 || ' minutes')::interval
            GROUP BY room_id
            """,
            floor, str(minutes),
        )

    counts = {r["room_id"]: int(r["total_visits"]) for r in rows}
    peak = max(counts.values(), default=0)

    items = [
        {
            "room_id": room_id,
            "total_visits": count,
            "intensity": round(count / peak, 3) if peak > 0 else 0.0,
        }
        for room_id, count in counts.items()
    ]
    return {"floor": floor, "minutes": minutes, "peak_visits": peak, "items": items}