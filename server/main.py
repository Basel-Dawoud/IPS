# server/main.py
# IPS backend server.
#
# Responsibilities:
#   - Subscribe to MQTT position/status/alert topics
#   - Write live state to Redis        (latest position/status per device)
#   - Write full history to TimescaleDB (every position, for analytics)
#   - Publish ACKs back to the device
#   - Broadcast live updates to connected dashboards over WebSocket
#   - Serve REST endpoints for floor metadata and history
#
# Contract: docs/MQTT_CONTRACT.md (v1.4)
#   - position: qos=0, retain=false  → live state belongs in Redis, not the broker
#   - status:   qos=1, retain=true   → last heartbeat visible immediately
#   - command:  qos=1, retain=false  → ACKs/alerts must arrive, never replayed
#
# Dashboard note:
#   The dashboard reads live state via WebSocket (/ws/live), backed by
#   Redis and pushed event-driven (on MQTT arrival), not on a timer. It
#   gets one full snapshot on connect, then incremental position/status
#   updates as they happen. It no longer needs direct MQTT broker access.

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager

import aiomqtt
import asyncpg
import redis.asyncio as redis
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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
# Default covers local dev only. Add your demo-day host/IP before presenting
# from anywhere other than localhost, or /floors and /health will be silently
# blocked by the browser with no error in the server logs.
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:8080").split(",")
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

# Comma-separated list — e.g. "http://localhost:8080,http://192.168.1.50:8080"
# Default covers local dev only. Add your demo-day host/IP before presenting
# from anywhere other than localhost, or /floors and /health will be silently
# blocked by the browser with no error in the server logs.
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:8080").split(",")
    if origin.strip()
]

# ── Globals (set during lifespan startup) ─────────────────────────────────────
pg_pool: asyncpg.Pool | None = None
redis_client: redis.Redis | None = None
mqtt_connected = False  # flipped by mqtt_loop — see /health

REQUIRED_POSITION_FIELDS = {"device_id", "building_id", "floor", "x", "y"}
REQUIRED_STATUS_FIELDS = {"device_id"}

ACTIVE_DEVICES_SET = "live:devices"
_position_counter = 0  # only used if HISTORY_SAMPLING_ENABLED

with open(FLOORS_CONFIG_PATH) as f:
    FLOORS_CONFIG = json.load(f)


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
    zone_id is optional in the contract — stored as NULL if absent.
    """
    async with pg_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO device_positions
                (ts, device_id, building_id, floor, zone_id, x, y)
            VALUES
                (to_timestamp($1), $2, $3, $4, $5, $6, $7)
            """,
            int(data.get("ts", time.time())),
            data["device_id"],
            data["building_id"],
            data["floor"],
            data.get("zone_id"),
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
        print(f"[WARN] Bad payload on {topic}, skipping: {e}")
        return

    if topic.endswith("/position"):
        if not REQUIRED_POSITION_FIELDS.issubset(data):
            print(f"[WARN] Missing fields in position payload, skipping: {data}")
            return

        # Live state is the part that must succeed for the ack to say "stored".
        try:
            await save_position_to_redis(data)
        except Exception as e:
            print(f"[ERR] Redis write failed for {data.get('device_id')}: {e}")
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
                print(f"[WARN] History write failed for {data.get('device_id')}: {e}")

        await publish_ack(client, data, "stored")

    elif topic.endswith("/status"):
        if not REQUIRED_STATUS_FIELDS.issubset(data):
            print(f"[WARN] Missing fields in status payload, skipping: {data}")
            return

        try:
            await save_status_to_redis(data)
        except Exception as e:
            print(f"[ERR] Redis write failed for {data.get('device_id')}: {e}")
            await publish_ack(client, data, "error")
            return

        await manager.broadcast({"type": "status", **data})
        await publish_ack(client, data, "status-updated")

    else:
        print(f"[WARN] Unhandled topic: {topic}")


# ── MQTT loop ───────────────────────────────────────────────────────────────────

async def mqtt_loop() -> None:
    global mqtt_connected
    while True:
        try:
            print("[MQTT] Connecting to broker...")
            async with aiomqtt.Client(MQTT_HOST, port=1883) as client:
                await client.subscribe("ips/+/device/+/position", qos=0)
                await client.subscribe("ips/+/device/+/status", qos=1)
                mqtt_connected = True
                print("[MQTT] Subscribed to position and status topics.")

                async for message in client.messages:
                    await handle_message(client, message)

        except Exception as e:
            mqtt_connected = False
            print(f"[MQTT] Error: {e}. Reconnecting in 5s...")
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


# ── Lifespan ─────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pg_pool, redis_client

    for attempt in range(5):
        try:
            pg_pool = await asyncpg.create_pool(POSTGRES_DSN, min_size=1, max_size=5)
            print("[DB] PostgreSQL pool created.")
            break
        except Exception as e:
            print(f"[DB] Not ready (attempt {attempt + 1}/5): {e}")
            await asyncio.sleep(3)
    else:
        raise RuntimeError("Could not connect to PostgreSQL after 5 attempts.")

    for attempt in range(5):
        try:
            redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            print("[REDIS] Client connected.")
            break
        except Exception as e:
            print(f"[REDIS] Not ready (attempt {attempt + 1}/5): {e}")
            await asyncio.sleep(3)
    else:
        raise RuntimeError("Could not connect to Redis after 5 attempts.")

    task = asyncio.create_task(mqtt_loop(), name="mqtt_loop")

    try:
        yield
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

        await pg_pool.close()
        print("[DB] PostgreSQL pool closed.")

        close = getattr(redis_client, "aclose", None)
        if callable(close):
            await close()
        print("[REDIS] Client closed.")


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


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    """
    Push-only endpoint. Sends one full snapshot on connect, then incremental
    position/status updates via ConnectionManager.broadcast() as MQTT events
    arrive — there is no timer here, broadcast() is called directly from
    handle_message().

    This coroutine itself does nothing but wait for the client to disconnect.
    It never expects or processes inbound messages, so it uses receive()
    rather than receive_text() — no assumption about frame type, just a
    passive wait that raises WebSocketDisconnect when the client goes away.
    """
    await manager.connect(websocket)
    try:
        snapshot = await fetch_live_positions()
        await websocket.send_json({"type": "snapshot", "items": snapshot["items"]})

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
            SELECT ts, device_id, building_id, floor, zone_id, x, y
            FROM device_positions
            WHERE device_id = $1
            ORDER BY ts DESC
            LIMIT $2
            """,
            device_id,
            limit,
        )
    return {"device_id": device_id, "count": len(rows), "items": [dict(r) for r in rows]}


# ── Planned next phase ─────────────────────────────────────────────────────────
# GET  /analytics/heatmap        → crowd_analytics continuous aggregate
# GET  /analytics/floor/{floor}  → crowd_analytics filtered by floor