#!/usr/bin/env python3
"""
phone.py

Map-aware MQTT simulator for the IPS project.

What this version does:
  • Loads the real floor grids from maps/floor_3_grid.npy and maps/floor_4_grid.npy
  • Spawns devices only on walkable cells
  • Moves them only through walkable neighboring cells
  • Publishes grid-aware coordinates (cell centers) so the dashboard can draw them
  • Keeps the same MQTT topics / ACK listener / status heartbeats / fleet mode

Notes:
  • The dashboard still needs a non-null meters_per_cell in server/floors.json
    (for example 1.0 while testing) to convert these coordinates onto the floor map.
  • By default, values 0, 2, and 3 are treated as walkable; 1 is treated as a wall.
    You can override this with WALKABLE_VALUES if the map semantics change later.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import signal
import time
import uuid
from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path

import aiomqtt
import numpy as np

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
MAPS_DIR = BASE_DIR / "maps"

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
BUILDING_ID = os.getenv("BUILDING_ID", "building1")

# 1 = single device emulation (stable device_id persisted in device_id.txt)
# >1 = fleet simulation for load / concurrency testing
NUM_DEVICES = max(1, int(os.getenv("NUM_DEVICES", "1")))

# Floors may be "3" or "3,4". If some requested floors are missing from maps/,
# they are ignored with a warning and the simulator falls back to the available maps.
REQUESTED_FLOORS = [
    int(f.strip())
    for f in os.getenv("FLOORS", "3").split(",")
    if f.strip()
]

# Movement controls
POSITION_INTERVAL_SECONDS = float(os.getenv("POSITION_INTERVAL_SECONDS", "2"))
STATUS_INTERVAL_SECONDS = float(os.getenv("STATUS_INTERVAL_SECONDS", "30"))
JITTER_SECONDS = float(os.getenv("JITTER_SECONDS", "0.5"))
STATS_INTERVAL_SECONDS = float(os.getenv("STATS_INTERVAL_SECONDS", "5"))
RECONNECT_DELAY_SECONDS = float(os.getenv("RECONNECT_DELAY_SECONDS", "5"))

# How positions are published:
#   x = col + 0.5
#   y = row + 0.5
# with a configurable scale factor. Keep 1.0 while testing the map-driven
# dashboard; later you can set this to a real meters-per-cell calibration.
COORD_SCALE = float(os.getenv("COORD_SCALE", "1.0"))

# Floor semantics:
#   1 = wall / blocked
#   0,2,3 = walkable by default
WALKABLE_VALUES = {
    int(v.strip())
    for v in os.getenv("WALKABLE_VALUES", "0,2,3").split(",")
    if v.strip()
}

# Path behavior
TURN_PROBABILITY = float(os.getenv("TURN_PROBABILITY", "0.18"))
DWELL_MIN_SECONDS = float(os.getenv("DWELL_MIN_SECONDS", "2.0"))
DWELL_MAX_SECONDS = float(os.getenv("DWELL_MAX_SECONDS", "8.0"))
MIN_TARGET_DISTANCE = int(os.getenv("MIN_TARGET_DISTANCE", "12"))

DEVICE_ID_FILE = Path(os.getenv("DEVICE_ID_FILE", "device_id.txt"))

# Logs
VERBOSE_SETTING = os.getenv("VERBOSE", "auto").lower()
if VERBOSE_SETTING == "auto":
    VERBOSE = NUM_DEVICES == 1
else:
    VERBOSE = VERBOSE_SETTING in {"1", "true", "yes", "on"}

# ── Data structures ──────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Cell:
    row: int
    col: int


stats = Counter()


# ── Helpers ───────────────────────────────────────────────────────────────────
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
    # Fleet mode: ephemeral IDs are fine and avoid stale identities.
    return [f"user-{uuid.uuid4().hex[:8]}" for _ in range(n)]


def parse_floor_maps() -> dict[int, "FloorMap"]:
    """
    Load all available floor grids from maps/.
    Floors missing from the filesystem are simply skipped with a warning.
    """
    floor_maps: dict[int, FloorMap] = {}

    for floor in sorted(set(REQUESTED_FLOORS)):
        path = MAPS_DIR / f"floor_{floor}_grid.npy"
        if not path.exists():
            print(f"[WARN]  Missing floor map: {path}")
            continue
        floor_maps[floor] = FloorMap(floor, path)

    if not floor_maps:
        # Fallback: load any maps that exist so the simulator still starts.
        for path in sorted(MAPS_DIR.glob("floor_*_grid.npy")):
            try:
                floor = int(path.stem.split("_")[1])
            except Exception:
                continue
            floor_maps[floor] = FloorMap(floor, path)

    if not floor_maps:
        raise RuntimeError(
            f"No floor maps found in {MAPS_DIR}. Expected floor_*_grid.npy files."
        )

    return floor_maps


# ── Floor map / movement engine ───────────────────────────────────────────────
class FloorMap:
    """
    Loads one floor grid and precomputes walkable cells and connected components.
    We keep the largest walkable connected component to avoid spawning in isolated
    islands that cannot reach the rest of the floor.
    """

    def __init__(self, floor: int, grid_path: Path):
        self.floor = floor
        self.grid_path = grid_path
        self.grid = np.load(grid_path)
        self.rows, self.cols = self.grid.shape

        self.walkable_mask = np.isin(self.grid, list(WALKABLE_VALUES))
        self._component_labels, self._components = self._label_components()
        self.primary_component_id = self._largest_component_id()
        self.primary_cells = self._components[self.primary_component_id]

        print(
            f"[MAP]    Floor {self.floor}: "
            f"{self.rows}x{self.cols}, "
            f"walkable={int(self.walkable_mask.sum())}, "
            f"primary_component={len(self.primary_cells)}"
        )

    def _label_components(self) -> tuple[np.ndarray, list[np.ndarray]]:
        labels = np.full(self.grid.shape, -1, dtype=np.int32)
        components: list[np.ndarray] = []
        component_id = 0

        for start_r, start_c in np.argwhere(self.walkable_mask):
            if labels[start_r, start_c] != -1:
                continue

            q = deque([(int(start_r), int(start_c))])
            labels[start_r, start_c] = component_id
            cells: list[tuple[int, int]] = []

            while q:
                r, c = q.popleft()
                cells.append((r, c))

                for nr, nc in self._neighbors_4(r, c):
                    if self.walkable_mask[nr, nc] and labels[nr, nc] == -1:
                        labels[nr, nc] = component_id
                        q.append((nr, nc))

            components.append(np.array(cells, dtype=np.int32))
            component_id += 1

        return labels, components

    def _largest_component_id(self) -> int:
        if not self._components:
            raise RuntimeError(f"Floor {self.floor} has no walkable cells.")
        return max(range(len(self._components)), key=lambda idx: len(self._components[idx]))

    def in_bounds(self, row: int, col: int) -> bool:
        return 0 <= row < self.rows and 0 <= col < self.cols

    def is_walkable(self, row: int, col: int) -> bool:
        return self.in_bounds(row, col) and bool(self.walkable_mask[row, col])

    def cell_value(self, row: int, col: int) -> int:
        if not self.in_bounds(row, col):
            return -1
        return int(self.grid[row, col])

    def random_spawn_cell(self) -> Cell:
        idx = random.randrange(len(self.primary_cells))
        row, col = self.primary_cells[idx]
        return Cell(int(row), int(col))

    def random_target_cell(self, current: Cell, min_distance: int = MIN_TARGET_DISTANCE) -> Cell:
        """
        Choose a new target in the same connected component, preferably not too close
        to the current cell.
        """
        min_distance = max(1, min_distance)
        current_r, current_c = current.row, current.col

        for _ in range(50):
            idx = random.randrange(len(self.primary_cells))
            row, col = self.primary_cells[idx]
            row = int(row)
            col = int(col)
            if (row, col) != (current_r, current_c):
                distance = abs(row - current_r) + abs(col - current_c)
                if distance >= min_distance:
                    return Cell(row, col)

        # Fallback: anything different from current.
        while True:
            idx = random.randrange(len(self.primary_cells))
            row, col = self.primary_cells[idx]
            row = int(row)
            col = int(col)
            if (row, col) != (current_r, current_c):
                return Cell(row, col)

    def _neighbors_4(self, row: int, col: int) -> list[tuple[int, int]]:
        out: list[tuple[int, int]] = []
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = row + dr, col + dc
            if self.in_bounds(nr, nc):
                out.append((nr, nc))
        return out

    def walkable_neighbors(self, row: int, col: int) -> list[Cell]:
        """
        Return neighbors that are walkable and in the primary connected component.
        """
        neighbors: list[Cell] = []
        for nr, nc in self._neighbors_4(row, col):
            if self.walkable_mask[nr, nc] and self._component_labels[nr, nc] == self.primary_component_id:
                neighbors.append(Cell(int(nr), int(nc)))
        return neighbors


class FloorNavigator:
    """
    A simple, realistic movement engine:
      • spawn on a walkable cell
      • choose a target on the same floor
      • move one walkable neighbor at a time toward that target
      • pause briefly at the destination before choosing a new target

    This is intentionally lighter than full A* while still looking natural.
    """

    def __init__(self, floor_map: FloorMap):
        self.floor_map = floor_map
        self.current = floor_map.random_spawn_cell()
        self.target = floor_map.random_target_cell(self.current)
        self.last_step: tuple[int, int] | None = None
        self.pause_until = 0.0

    def _choose_next_cell(self, neighbors: list[Cell]) -> Cell:
        # Score by Manhattan distance to the target, with a small bias to keep
        # the current direction when possible.
        scored: list[tuple[float, Cell]] = []
        for cell in neighbors:
            dist = abs(cell.row - self.target.row) + abs(cell.col - self.target.col)
            if self.last_step is not None:
                step_dir = (cell.row - self.current.row, cell.col - self.current.col)
                if step_dir == self.last_step:
                    dist -= 0.25
            scored.append((dist, cell))

        scored.sort(key=lambda item: item[0])
        best_score = scored[0][0]
        best = [cell for score, cell in scored if abs(score - best_score) < 1e-9]

        # A little randomness makes the motion less robotic.
        if len(neighbors) > 1 and random.random() < TURN_PROBABILITY:
            return random.choice(neighbors)

        return random.choice(best)

    def advance(self) -> tuple[Cell, bool]:
        """
        Move one tick.
        Returns: (current_cell, moved_this_tick)
        """
        now = time.monotonic()

        if now < self.pause_until:
            return self.current, False

        # Reached the destination: pause, then choose a new one.
        if self.current == self.target:
            self.pause_until = now + random.uniform(DWELL_MIN_SECONDS, DWELL_MAX_SECONDS)
            self.target = self.floor_map.random_target_cell(self.current)
            return self.current, False

        neighbors = self.floor_map.walkable_neighbors(self.current.row, self.current.col)
        if not neighbors:
            # Safety fallback: respawn if we somehow reach a dead end.
            self.current = self.floor_map.random_spawn_cell()
            self.target = self.floor_map.random_target_cell(self.current)
            self.last_step = None
            return self.current, True

        chosen = self._choose_next_cell(neighbors)
        prev = self.current
        self.current = chosen
        self.last_step = (self.current.row - prev.row, self.current.col - prev.col)

        # If we just hit the target, schedule a dwell.
        if self.current == self.target:
            self.pause_until = now + random.uniform(DWELL_MIN_SECONDS, DWELL_MAX_SECONDS)

        return self.current, True


# ── MQTT-capable simulated device ─────────────────────────────────────────────
class SimulatedDevice:
    def __init__(self, device_id: str, floor_map: FloorMap):
        self.device_id = device_id
        self.floor_map = floor_map
        self.navigator = FloorNavigator(floor_map)
        self.battery = random.randint(55, 100)

        self.position_topic = f"ips/{BUILDING_ID}/device/{device_id}/position"
        self.status_topic = f"ips/{BUILDING_ID}/device/{device_id}/status"

    @property
    def floor(self) -> int:
        return self.floor_map.floor

    def zone_id(self, row: int, col: int) -> str:
        value = self.floor_map.cell_value(row, col)
        if value == 0:
            return f"floor-{self.floor}-open"
        if value == 2:
            return f"floor-{self.floor}-tagged-zone-2"
        if value == 3:
            return f"floor-{self.floor}-tagged-zone-3"
        return f"floor-{self.floor}-value-{value}"

    def step_position(self) -> tuple[dict, bool]:
        """
        Advance one map-aware step and return the MQTT payload plus a moved flag.
        """
        cell, moved = self.navigator.advance()

        # Small jitter inside the cell so the dot doesn't look perfectly snapped.
        jitter_x = random.uniform(-0.30, 0.30)
        jitter_y = random.uniform(-0.30, 0.30)

        # Publish cell-centered coordinates (scaled).
        # The dashboard can draw these directly when floors.json uses the same scale.
        x = (cell.col + 0.5 + jitter_x) * COORD_SCALE
        y = (cell.row + 0.5 + jitter_y) * COORD_SCALE

        accuracy = round(random.uniform(0.60, 1.80) * COORD_SCALE, 2)

        payload = {
            "device_id": self.device_id,
            "building_id": BUILDING_ID,
            "floor": self.floor,
            "zone_id": self.zone_id(cell.row, cell.col),
            "grid_row": cell.row,
            "grid_col": cell.col,
            "map_value": self.floor_map.cell_value(cell.row, cell.col),
            "x": round(x, 2),
            "y": round(y, 2),
            "accuracy": accuracy,
            "motion": "walking" if moved else "stationary",
            "ts": int(time.time()),
            "units": "grid_cells",
        }
        return payload, moved

    def status_payload(self) -> dict:
        # Tiny battery drain over time to make the demo feel alive.
        self.battery = max(5, self.battery - random.randint(0, 1))
        return {
            "device_id": self.device_id,
            "building_id": BUILDING_ID,
            "floor": self.floor,
            "ts": int(time.time()),
            "state": "online",
            "battery": self.battery,
            "connected": True,
        }

    async def publish_positions(self, client: aiomqtt.Client) -> None:
        await asyncio.sleep(random.uniform(0, POSITION_INTERVAL_SECONDS))

        while True:
            payload, _moved = self.step_position()
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
def build_devices(floor_maps: dict[int, FloorMap]) -> list[SimulatedDevice]:
    device_ids = make_device_ids(NUM_DEVICES)

    available_floors = sorted(floor_maps)
    if not available_floors:
        raise RuntimeError("No available floors were loaded.")

    if NUM_DEVICES == 1:
        floor_assignments = [available_floors[0]]
    else:
        floor_assignments = [random.choice(available_floors) for _ in device_ids]

    return [
        SimulatedDevice(did, floor_maps[floor])
        for did, floor in zip(device_ids, floor_assignments, strict=True)
    ]


async def run_once(floor_maps: dict[int, FloorMap]) -> None:
    devices = build_devices(floor_maps)

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
        print(
            f"[SIM]    Simulating {NUM_DEVICES} device(s) on floors "
            f"{sorted({d.floor for d in devices})}"
        )
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
    floor_maps = parse_floor_maps()

    missing_requested = [f for f in REQUESTED_FLOORS if f not in floor_maps]
    if missing_requested:
        print(
            f"[WARN]  Requested floor(s) not found in maps/: {missing_requested}. "
            f"Using available floor(s): {sorted(floor_maps)}"
        )

    while True:
        try:
            await run_once(floor_maps)
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
