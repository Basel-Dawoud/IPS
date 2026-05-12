# phone.py
# MQTT simulator for one mobile device.
# In the real app, this logic will live inside the Flutter / Kotlin client.
# The simulator keeps running, publishes predicted positions, and listens for commands.
#
# Contract: docs/MQTT_CONTRACT.md  (v1.2)

import asyncio
import json
import os
import time
import uuid
from pathlib import Path

import aiomqtt

# ── Configuration ─────────────────────────────────────────────────────────────
MQTT_HOST                 = os.getenv("MQTT_HOST", "localhost")
BUILDING_ID               = os.getenv("BUILDING_ID", "building1")
FLOOR                     = int(os.getenv("FLOOR", "2"))
DEVICE_ID_FILE            = Path(os.getenv("DEVICE_ID_FILE", "device_id.txt"))
POSITION_INTERVAL_SECONDS = float(os.getenv("POSITION_INTERVAL_SECONDS", "2"))
STATUS_INTERVAL_SECONDS   = float(os.getenv("STATUS_INTERVAL_SECONDS", "30"))
RECONNECT_DELAY_SECONDS   = float(os.getenv("RECONNECT_DELAY_SECONDS", "5"))

# ── Device ID (stable across restarts) ────────────────────────────────────────
def load_or_create_device_id() -> str:
    """
    Load a stable device_id from disk, or create one if it does not exist.

    The same value is used as:
      - MQTT CONNECT ClientID
      - payload field  device_id
      - topic path segment  .../device/<device_id>/...

    Format: user-<8 hex chars>   e.g. user-a3f9b2c1
    """
    if DEVICE_ID_FILE.exists():
        device_id = DEVICE_ID_FILE.read_text(encoding="utf-8").strip()
        if device_id:
            return device_id

    device_id = f"user-{uuid.uuid4().hex[:8]}"
    DEVICE_ID_FILE.write_text(device_id, encoding="utf-8")
    return device_id


DEVICE_ID = load_or_create_device_id()

# ── Topics (stable — floor is in the payload, not the topic) ──────────────────
# See contract section "Topic design" for the full topic table.
POSITION_TOPIC = f"ips/{BUILDING_ID}/device/{DEVICE_ID}/position"
STATUS_TOPIC   = f"ips/{BUILDING_ID}/device/{DEVICE_ID}/status"
COMMAND_TOPIC  = f"ips/{BUILDING_ID}/device/{DEVICE_ID}/command"
ALERT_TOPIC    = f"ips/{BUILDING_ID}/device/{DEVICE_ID}/alert"


# ── Simulated position ────────────────────────────────────────────────────────
def simulate_predicted_position(step: int) -> dict:
    """
    Return a fake predicted position.

    In the real mobile app replace this entire function with the output of
    the on-device ML fingerprinting model:
      1. Scan nearby BLE beacons → collect RSSI values.
      2. Run the .tflite / ONNX model → get (floor, x, y, accuracy).
      3. Publish that result here.
      4. Also display it in the UI locally (no round-trip needed).
    """
    x = round(10.0 + (step % 20) * 0.5, 2)
    y = round(5.0  + (step % 15) * 0.4, 2)

    return {
        "device_id":   DEVICE_ID,
        "building_id": BUILDING_ID,
        "floor":       FLOOR,          # floor in payload only — see contract
        "zone_id":     "north_corridor" if x < 15 else "lobby",  # TODO: from model
        "x":           x,
        "y":           y,
        "accuracy":    1.5,
        "motion":      "walking",
        "ts":          int(time.time()),
    }


# ── Publishers ────────────────────────────────────────────────────────────────
async def publish_positions(client: aiomqtt.Client) -> None:
    """
    Publish a predicted position every POSITION_INTERVAL_SECONDS.
    QoS 0, retain=True — see contract QoS table.
    """
    step = 0
    while True:
        try:
            payload = simulate_predicted_position(step)
            await client.publish(
                POSITION_TOPIC,
                json.dumps(payload),
                qos=0,
                retain=True,    # late subscriber (dashboard) gets last known position immediately
            )
            print(f"[POS]    {POSITION_TOPIC}: {payload}")
            step += 1
        except Exception as e:
            print(f"[POS]    Publish failed: {e}")

        await asyncio.sleep(POSITION_INTERVAL_SECONDS)


async def publish_status_periodically(client: aiomqtt.Client) -> None:
    """
    Publish a device heartbeat every STATUS_INTERVAL_SECONDS.
    QoS 1, retain=True — see contract QoS table.
    """
    while True:
        try:
            payload = {
                "device_id":   DEVICE_ID,
                "building_id": BUILDING_ID,
                "floor":       FLOOR,
                "ts":          int(time.time()),
                "state":       "online",
                "battery":     84,
                "connected":   True,
            }
            await client.publish(
                STATUS_TOPIC,
                json.dumps(payload),
                qos=1,
                retain=True,    # monitoring always sees the latest health state
            )
            print(f"[STATUS] {STATUS_TOPIC}: {payload}")
        except Exception as e:
            print(f"[STATUS] Publish failed: {e}")

        await asyncio.sleep(STATUS_INTERVAL_SECONDS)


# ── Listener ──────────────────────────────────────────────────────────────────
async def listen_for_commands(client: aiomqtt.Client) -> None:
    """
    Subscribe to commands and alerts from the backend.
    QoS 1 on both — must arrive, must not be replayed (retain=False on sender side).
    """
    await client.subscribe(COMMAND_TOPIC, qos=1)
    await client.subscribe(ALERT_TOPIC,   qos=1)
    print(f"[SUB]    Listening on {COMMAND_TOPIC}")
    print(f"[SUB]    Listening on {ALERT_TOPIC}")

    async for message in client.messages:
        print(f"[RX]     {message.topic}: {message.payload.decode()}")


# ── Session ───────────────────────────────────────────────────────────────────
async def run_once() -> None:
    """
    Open one MQTT connection and run all tasks until the connection drops.
    Subscriptions and task cleanup are handled automatically on exit.
    """
    async with aiomqtt.Client(
        hostname=MQTT_HOST,
        port=1883,
        identifier=DEVICE_ID,   # stable ClientID — matches device_id and topic
    ) as client:
        print(f"[CONN]   Connected to {MQTT_HOST}:1883")
        print(f"[CONN]   Device ID : {DEVICE_ID}")
        print(f"[CONN]   Building  : {BUILDING_ID}  Floor: {FLOOR}")

        tasks = [
            asyncio.create_task(publish_positions(client),         name="positions"),
            asyncio.create_task(publish_status_periodically(client), name="status"),
            asyncio.create_task(listen_for_commands(client),       name="commands"),
        ]

        try:
            await asyncio.gather(*tasks)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


# ── Entry point with reconnect loop ───────────────────────────────────────────
async def main() -> None:
    print(f"[BOOT]   phone.py starting — device {DEVICE_ID}")
    while True:
        try:
            await run_once()
        except Exception as e:
            print(f"[ERR]    {e}. Reconnecting in {RECONNECT_DELAY_SECONDS}s...")
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())