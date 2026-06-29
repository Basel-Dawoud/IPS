# phone.py
# MQTT simulator — one real device (default) or a fleet for load testing.
#
# Single-device mode mirrors a real phone:
#   - stable device_id persisted in device_id.txt
#   - one logical device
# Fleet mode simulates many users concurrently:
#   - many logical device IDs
#   - one MQTT connection
#   - staggered starts + jitter to avoid burst traffic
#
# The fleet mode is intentionally simulator-only. A real mobile app would still
# run one device per user, with one MQTT client per phone.

import asyncio
import json
import os
import random
import signal
import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Iterable

import aiomqtt

# ── Configuration ─────────────────────────────────────────────────────────────
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
BUILDING_ID = os.getenv("BUILDING_ID", "building1")

# 1 = realistic single-device emulation.
# >1 = fleet simulation for load / concurrency testing.
NUM_DEVICES = max(1, int(os.getenv("NUM_DEVICES", "1")))

# Floors may be "3" or "1,2,3". Fleet devices are assigned randomly from this set.
FLOORS = [int(f.strip()) for f in os.getenv("FLOORS", "3").split(",")]

# Movement model controls.
GRID_SIZE = float(os.getenv("GRID_SIZE", "100"))       # floor bounds: 0..GRID_SIZE
STEP_SIZE = float(os.getenv("STEP_SIZE", "2.0"))       # max metres moved per tick

# Publish cadence.
POSITION_INTERVAL_SECONDS = float(os.getenv("POSITION_INTERVAL_SECONDS", "2"))
STATUS_INTERVAL_SECONDS = float(os.getenv("STATUS_INTERVAL_SECONDS", "30"))
JITTER_SECONDS = float(os.getenv("JITTER_SECONDS", "0.5"))
STATS_INTERVAL_SECONDS = float(os.getenv("STATS_INTERVAL_SECONDS", "5"))
RECONNECT_DELAY_SECONDS = float(os.getenv("RECONNECT_DELAY_SECONDS", "5"))

DEVICE_ID_FILE = Path(os.getenv("DEVICE_ID_FILE", "device_id.txt"))

# Logs.
VERBOSE = os.getenv("VERBOSE", "auto").lower()
if VERBOSE == "auto":
    VERBOSE = NUM_DEVICES == 1
else:
    VERBOSE = VERBOSE in {"1", "true", "yes", "on"}


# ── Helpers ───────────────────────────────────────────────────────────────────
def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def load_or_create_single_device_id() -> str:
    """
    Stable device_id for the single-device path, persisted across restarts.
    Format: user-<8 hex chars>
    """
    if DEVICE_ID_FILE.exists():
        device_id = DEVICE_ID_FILE.read_text(encoding="utf-8").strip()
        if device_id:
            return device_id

    device_id = f"user-{uuid.uuid4().hex[:8]}"
    DEVICE_ID_FILE.write_text(device_id, encoding="utf-8")
    return device_id


def make_device_ids(n: int) -> list[str]:
    if n == 1:
        return [load_or_create_single_device_id()]
    # Fleet mode: ephemeral IDs are fine and avoid reusing stale identities.
    return [f"user-{uuid.uuid4().hex[:8]}" for _ in range(n)]


stats = Counter()


# ── One simulated device ──────────────────────────────────────────────────────
class SimulatedDevice:
    def __init__(self, device_id: str, floor: int):
        self.device_id = device_id
        self.floor = floor
        self.x = random.uniform(0, GRID_SIZE)
        self.y = random.uniform(0, GRID_SIZE)

        self.position_topic = f"ips/{BUILDING_ID}/device/{device_id}/position"
        self.status_topic = f"ips/{BUILDING_ID}/device/{device_id}/status"

    def _zone_id(self) -> str:
        """
        Lightweight zone estimate so the full pipeline carries zone_id end-to-end.
        Replace this later with your real indoor-positioning model output.
        """
        col = int(self.x // max(1.0, (GRID_SIZE / 2)))
        row = int(self.y // max(1.0, (GRID_SIZE / 2)))
        return f"zone-{row}-{col}"

    def step_position(self) -> dict:
        """
        Random walk, clamped to floor bounds.
        This is enough to prove concurrent ingestion and end-to-end persistence.
        """
        self.x = clamp(self.x + random.uniform(-STEP_SIZE, STEP_SIZE), 0, GRID_SIZE)
        self.y = clamp(self.y + random.uniform(-STEP_SIZE, STEP_SIZE), 0, GRID_SIZE)

        return {
            "device_id": self.device_id,
            "building_id": BUILDING_ID,
            "floor": self.floor,
            "zone_id": self._zone_id(),
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "accuracy": round(random.uniform(1.0, 2.5), 2),
            "motion": "walking" if random.random() > 0.1 else "stationary",
            "ts": int(time.time()),
        }

    def status_payload(self) -> dict:
        return {
            "device_id": self.device_id,
            "building_id": BUILDING_ID,
            "floor": self.floor,
            "ts": int(time.time()),
            "state": "online",
            "battery": random.randint(40, 100),
            "connected": True,
        }

    async def publish_positions(self, client: aiomqtt.Client) -> None:
        await asyncio.sleep(random.uniform(0, POSITION_INTERVAL_SECONDS))

        while True:
            payload = self.step_position()
            try:
                await client.publish(
                    self.position_topic,
                    json.dumps(payload),
                    qos=0,
                    retain=False,  # live state belongs in Redis, not retained in the broker
                )
                stats["position_sent"] += 1
                if VERBOSE:
                    print(f"[POS]    {self.position_topic}: {payload}")
            except Exception as e:
                stats["position_failed"] += 1
                if VERBOSE:
                    print(f"[POS]    Publish failed: {e}")

            await asyncio.sleep(POSITION_INTERVAL_SECONDS + random.uniform(0, JITTER_SECONDS))

    async def publish_status(self, client: aiomqtt.Client) -> None:
        await asyncio.sleep(random.uniform(0, STATUS_INTERVAL_SECONDS))

        while True:
            payload = self.status_payload()
            try:
                await client.publish(
                    self.status_topic,
                    json.dumps(payload),
                    qos=1,
                    retain=True,
                )
                stats["status_sent"] += 1
                if VERBOSE:
                    print(f"[STATUS] {self.status_topic}: {payload}")
            except Exception as e:
                stats["status_failed"] += 1
                if VERBOSE:
                    print(f"[STATUS] Publish failed: {e}")

            await asyncio.sleep(STATUS_INTERVAL_SECONDS + random.uniform(0, JITTER_SECONDS))

    async def run(self, client: aiomqtt.Client) -> None:
        await asyncio.gather(
            self.publish_positions(client),
            self.publish_status(client),
        )


# ── Shared listener ───────────────────────────────────────────────────────────
async def listen_for_messages(client: aiomqtt.Client) -> None:
    """
    One wildcard subscription covers every simulated device.
    This keeps the simulator lightweight even at higher NUM_DEVICES values.
    """
    await client.subscribe(f"ips/{BUILDING_ID}/device/+/command", qos=1)
    await client.subscribe(f"ips/{BUILDING_ID}/device/+/alert", qos=1)
    print(f"[SUB]    Listening on ips/{BUILDING_ID}/device/+/command")
    print(f"[SUB]    Listening on ips/{BUILDING_ID}/device/+/alert")

    async for message in client.messages:
        topic = str(message.topic)

        try:
            data = json.loads(message.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            stats["rx_bad_json"] += 1
            continue

        if topic.endswith("/command"):
            status = data.get("status", "unknown")
            stats[f"command_{status}"] += 1
            if VERBOSE:
                print(f"[RX]     {topic}: {data}")

        elif topic.endswith("/alert"):
            stats["alert_received"] += 1
            print(f"[ALERT]  {topic}: {data}")


async def print_stats_periodically() -> None:
    while True:
        await asyncio.sleep(STATS_INTERVAL_SECONDS)
        print(f"[STATS]  {dict(stats)}")


# ── Session ───────────────────────────────────────────────────────────────────
def build_devices() -> list[SimulatedDevice]:
    device_ids = make_device_ids(NUM_DEVICES)
    if NUM_DEVICES == 1:
        floors = [FLOORS[0]]
    else:
        floors = [random.choice(FLOORS) for _ in device_ids]
    return [SimulatedDevice(did, floor) for did, floor in zip(device_ids, floors)]


async def run_once() -> None:
    devices = build_devices()

    # Fleet mode uses one simulator connection for convenience and throughput.
    # Real phones are still one client per user; this is just the load-test harness.
    if NUM_DEVICES == 1:
        client_identifier = devices[0].device_id
    else:
        client_identifier = f"sim-fleet-{uuid.uuid4().hex[:8]}"

    async with aiomqtt.Client(
        hostname=MQTT_HOST,
        port=MQTT_PORT,
        identifier=client_identifier,
    ) as client:
        print(f"[CONN]   Connected to {MQTT_HOST}:{MQTT_PORT} as {client_identifier}")
        print(f"[SIM]    Simulating {NUM_DEVICES} device(s) on floors {sorted(set(d.floor for d in devices))}")
        if NUM_DEVICES == 1:
            print(f"[SIM]    Device ID: {devices[0].device_id}")

        tasks = [asyncio.create_task(device.run(client), name=device.device_id) for device in devices]
        tasks.append(asyncio.create_task(listen_for_messages(client), name="listener"))
        if NUM_DEVICES > 1:
            tasks.append(asyncio.create_task(print_stats_periodically(), name="stats"))

        try:
            await asyncio.gather(*tasks)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


async def main() -> None:
    _install_signal_handlers()
    print(f"[BOOT]   phone.py starting — NUM_DEVICES={NUM_DEVICES}")
    while True:
        try:
            await run_once()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"[ERR]    {e}. Reconnecting in {RECONNECT_DELAY_SECONDS}s...")
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)


def _install_signal_handlers() -> None:
    """
    Best-effort graceful shutdown on Unix-like systems.
    On Windows / restricted environments, KeyboardInterrupt still works.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    def _request_stop() -> None:
        for task in asyncio.all_tasks(loop):
            task.cancel()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except NotImplementedError:
            pass
        except RuntimeError:
            # Event loop may not support signal handlers in this environment.
            pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[BOOT]   Stopped by user.")