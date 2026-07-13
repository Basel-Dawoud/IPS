#!/usr/bin/env python3
"""
phone.py

Map-aware MQTT simulator for the IPS project.

This version:
  • Loads the real floor grids from maps/floor_3_grid.npy and maps/floor_4_grid.npy
  • Loads server/floors.json for each floor's corridor_rows, room directory,
    and meters_per_cell — the same calibration the dashboard uses to draw
    positions, so a published (x, y) means the same real-world distance on
    both ends of the pipeline
  • Confines devices to the main corridor band only — never inside a room —
    matching real foot traffic (CORRIDOR_ONLY=true by default)
  • Spawns devices only on walkable corridor cells
  • Moves them through a deterministic route:
      floor 3 -> right stairs -> floor 4 -> left stairs -> floor 3 -> repeat
  • Uses the blue stair cells for floor transitions
  • Walks at a real, configurable pace (WALK_SPEED_MPS) rather than one grid
    cell per publish tick — see step_position()'s docstring for how a
    per-tick meter budget turns into whole-cell hops plus a sub-cell
    fractional lead-in, so speed stays realistic regardless of how coarse
    or fine a given floor's grid resolution happens to be
  • Publishes coordinates in real meters (relative to each floor's origin),
    not raw grid indices

Notes:
  • Set CORRIDOR_ONLY=false to fall back to free movement across every
    walkable cell on the floor (useful for debugging).
  • By default, values 0, 2, and 3 are treated as walkable; 1 is treated as
    a wall. Override with WALKABLE_VALUES if the map semantics change later.
  • TURN_PROBABILITY is defined below but not currently read anywhere — a
    leftover from an earlier random-walk navigator, since replaced by the
    deterministic BFS-pathed FloorNavigator. Left in place rather than
    removed here since route diversity is a separate concern from this
    change (real-meter speed calibration); harmless either way today.
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
FLOORS_CONFIG_PATH = Path(os.getenv("FLOORS_CONFIG_PATH", BASE_DIR / "server" / "floors.json"))

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
BUILDING_ID = os.getenv("BUILDING_ID", "building1")

# 1 = single device emulation (stable device_id persisted in device_id.txt)
# >1 = fleet simulation for load / concurrency testing
NUM_DEVICES = max(1, int(os.getenv("NUM_DEVICES", "1")))

# Floors may be "3" or "3,4". If some requested floors are missing from maps/,
# they are ignored with a warning and the simulator falls back to available maps.
REQUESTED_FLOORS = [
    int(f.strip())
    for f in os.getenv("FLOORS", "3,4").split(",")
    if f.strip()
]

# Stair areas (Value 2) for floor transitions
# Floor 3: Area 1 (left) ~85, Area 2 (right) ~397
# Floor 4: Area 1 (left) ~77, Area 2 (right) ~395
STAIRS = {
    3: {"left": 85, "right": 397},
    4: {"left": 77, "right": 395},
}

# ── Scenario mode (opt-in) ────────────────────────────────────────────────────
# When SCENARIO is set (e.g. SCENARIO=corridor458), phone.py ignores the default
# looping FloorNavigator route and instead runs a fixed, scripted set of users
# defined in build_scenario_devices(). Leave empty for the original behavior.
SCENARIO = os.getenv("SCENARIO", "").strip().lower()

# Spawn anchor for the corridor458 scenario: the corridor cell in front of room
# 458 ("Home Decor", floor 4 cols 147-180 -> center ~163). SCENARIO_START_ROW
# defaults to the middle of floor 4's corridor band when unset. Each of the 3
# users is offset by a few columns (SCENARIO_OFFSET_STEP) so their starting dots
# don't perfectly overlap on the dashboard.
SCENARIO_START_COL = int(os.getenv("SCENARIO_START_COL", "163"))
SCENARIO_START_ROW = os.getenv("SCENARIO_START_ROW")  # optional int override
SCENARIO_OFFSET_STEP = int(os.getenv("SCENARIO_OFFSET_STEP", "3"))

# Movement controls
POSITION_INTERVAL_SECONDS = float(os.getenv("POSITION_INTERVAL_SECONDS", "0.5"))
STATUS_INTERVAL_SECONDS = float(os.getenv("STATUS_INTERVAL_SECONDS", "30"))
JITTER_SECONDS = float(os.getenv("JITTER_SECONDS", "0.10"))
STATS_INTERVAL_SECONDS = float(os.getenv("STATS_INTERVAL_SECONDS", "5"))
RECONNECT_DELAY_SECONDS = float(os.getenv("RECONNECT_DELAY_SECONDS", "5"))

# How fast the simulated person walks, in real meters/second. 1.2 m/s is a
# commonly-cited average adult indoor walking pace (browsing/shopping context
# tends toward the slower end of the general 0.7-1.8 m/s range seen in
# pedestrian-flow studies; a purposeful commuter pace would be faster).
# WALK_SPEED_JITTER adds per-tick variation so the pace doesn't feel
# metronomic — real people don't walk at a perfectly constant speed.
WALK_SPEED_MPS = float(os.getenv("WALK_SPEED_MPS", "1.2"))
WALK_SPEED_JITTER = float(os.getenv("WALK_SPEED_JITTER", "0.15"))  # +/- fraction

# Simulated sensor/fingerprinting noise, in real meters — independent of grid
# cell size (previously this was expressed as a fraction of a grid cell,
# which meant the *physical* amount of noise silently changed any time the
# grid resolution changed; expressing it directly in meters keeps it meaning
# the same thing regardless of map resolution).
POSITION_JITTER_METERS = float(os.getenv("POSITION_JITTER_METERS", "0.3"))
ACCURACY_METERS_MIN = float(os.getenv("ACCURACY_METERS_MIN", "0.6"))
ACCURACY_METERS_MAX = float(os.getenv("ACCURACY_METERS_MAX", "1.8"))

# Floor semantics:
#   1 = wall / blocked
#   0,2,3 = walkable by default
WALKABLE_VALUES = {
    int(v.strip())
    for v in os.getenv("WALKABLE_VALUES", "0,2,3").split(",")
    if v.strip()
}

# When true (default), devices are confined to the floor's main corridor band
# (server/floors.json -> corridor_rows), never entering room interiors.
CORRIDOR_ONLY = os.getenv("CORRIDOR_ONLY", "true").lower() in {"1", "true", "yes", "on"}

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
    return [f"user-{uuid.uuid4().hex[:8]}" for _ in range(n)]


def load_floors_config() -> dict:
    """
    Reads server/floors.json for corridor_rows and the room directory.
    """
    if not FLOORS_CONFIG_PATH.exists():
        print(f"[WARN]  {FLOORS_CONFIG_PATH} not found — corridor confinement disabled.")
        return {}
    try:
        with open(FLOORS_CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"[WARN]  Could not read {FLOORS_CONFIG_PATH}: {e} — corridor confinement disabled.")
        return {}


def parse_floor_maps() -> dict[int, "FloorMap"]:
    """
    Load all available floor grids from maps/.
    Floors missing from the filesystem are skipped with a warning.
    """
    floors_config = load_floors_config()
    floor_maps: dict[int, FloorMap] = {}

    def build(floor: int, path: Path) -> "FloorMap":
        floor_cfg = floors_config.get(str(floor), {})
        corridor_rows = floor_cfg.get("corridor_rows")
        corridor_rows = tuple(corridor_rows) if corridor_rows else None
        rooms = floor_cfg.get("rooms", [])
        meters_per_cell = floor_cfg.get("meters_per_cell")
        origin = floor_cfg.get("origin")
        return FloorMap(
            floor, path,
            corridor_rows=corridor_rows,
            rooms=rooms,
            meters_per_cell=meters_per_cell,
            origin=origin,
        )

    for floor in sorted(set(REQUESTED_FLOORS)):
        path = MAPS_DIR / f"floor_{floor}_grid.npy"
        if not path.exists():
            print(f"[WARN]  Missing floor map: {path}")
            continue
        floor_maps[floor] = build(floor, path)

    if not floor_maps:
        for path in sorted(MAPS_DIR.glob("floor_*_grid.npy")):
            try:
                floor = int(path.stem.split("_")[1])
            except Exception:
                continue
            floor_maps[floor] = build(floor, path)

    if not floor_maps:
        raise RuntimeError(f"No floor maps found in {MAPS_DIR}. Expected floor_*_grid.npy files.")

    return floor_maps


# ── Floor map / movement engine ───────────────────────────────────────────────
class FloorMap:
    """
    Loads one floor grid and precomputes walkable cells and connected components.
    """

    def __init__(
        self,
        floor: int,
        grid_path: Path,
        corridor_rows: tuple[int, int] | None = None,
        rooms: list[dict] | None = None,
        meters_per_cell: float | None = None,
        origin: dict | None = None,
    ):
        self.floor = floor
        self.grid_path = grid_path
        self.grid = np.load(grid_path)
        self.rows, self.cols = self.grid.shape
        self.rooms = rooms or []

        if meters_per_cell:
            self.meters_per_cell = meters_per_cell
        else:
            print(
                f"[WARN]  Floor {floor}: no meters_per_cell in floors.json — "
                f"falling back to 1.0 (grid cell == 1 meter, almost certainly "
                f"wrong). Run tools/render_floor_maps.py to calibrate."
            )
            self.meters_per_cell = 1.0
        origin = origin or {}
        self.origin_row = float(origin.get("row", 0))
        self.origin_col = float(origin.get("col", 0))

        base_walkable = np.isin(self.grid, list(WALKABLE_VALUES))

        if CORRIDOR_ONLY and corridor_rows is not None:
            row_start, row_end = corridor_rows
            row_mask = np.zeros(self.rows, dtype=bool)
            row_mask[row_start:row_end + 1] = True
            self.walkable_mask = base_walkable & row_mask[:, None]
            self.corridor_rows = (row_start, row_end)
        else:
            self.walkable_mask = base_walkable
            self.corridor_rows = None
            if CORRIDOR_ONLY and corridor_rows is None:
                print(
                    f"[WARN]  Floor {floor}: CORRIDOR_ONLY is enabled but no "
                    f"corridor_rows found in floors.json — falling back to full "
                    f"floor movement. Run tools/render_floor_maps.py to fix."
                )

        self._component_labels, self._components = self._label_components()
        self.primary_component_id = self._largest_component_id()
        self.primary_cells = self._components[self.primary_component_id]

        mode = f"corridor-only rows {self.corridor_rows}" if self.corridor_rows else "full floor"
        print(
            f"[MAP]    Floor {self.floor}: "
            f"{self.rows}x{self.cols}, mode={mode}, "
            f"walkable={int(self.walkable_mask.sum())}, "
            f"primary_component={len(self.primary_cells)}, "
            f"rooms={len(self.rooms)}, "
            f"meters_per_cell={self.meters_per_cell:.5f}"
        )

    def nearest_room_id(self, col: int) -> str | None:
        """
        Returns the room_id whose column span contains (or is closest to) the given column.
        """
        if not self.rooms:
            return None

        for room in self.rooms:
            if room["col_start"] <= col <= room["col_end"]:
                return room["id"]

        closest = min(
            self.rooms,
            key=lambda r: min(abs(col - r["col_start"]), abs(col - r["col_end"])),
        )
        return closest["id"]

    def stair_candidates(self, side: str, max_col_delta: int = 20) -> list[Cell]:
        """
        Return walkable stair cells (value == 2) near the configured stair column.
        """
        stair_col = STAIRS[self.floor][side]
        cells = np.argwhere(self.grid == 2)

        out: list[Cell] = []
        for r, c in cells:
            rr = int(r)
            cc = int(c)
            if self.walkable_mask[rr, cc] and abs(cc - stair_col) <= max_col_delta:
                out.append(Cell(rr, cc))
        return out

    def nearest_stair_cell(self, side: str, from_cell: Cell) -> Cell:
        """
        Pick the nearest blue stair cell on this floor for the requested side.
        Falls back to the nearest walkable cell near the stair column.
        """
        candidates = self.stair_candidates(side)
        if candidates:
            return min(
                candidates,
                key=lambda cell: abs(cell.row - from_cell.row) + abs(cell.col - from_cell.col),
            )

        stair_col = STAIRS[self.floor][side]
        return min(
            (Cell(int(r), int(c)) for r, c in self.primary_cells),
            key=lambda cell: abs(cell.row - from_cell.row) + abs(cell.col - stair_col),
        )

    def shortest_path(self, start: Cell, goal: Cell) -> list[Cell]:
        """
        BFS shortest path over the primary walkable component.
        Returns the path excluding `start` and including `goal`.
        """
        if start == goal:
            return []

        q = deque([start])
        prev: dict[Cell, Cell | None] = {start: None}

        while q:
            cur = q.popleft()
            for nb in self.walkable_neighbors(cur.row, cur.col):
                if nb in prev:
                    continue
                prev[nb] = cur
                if nb == goal:
                    q.clear()
                    break
                q.append(nb)

        if goal not in prev:
            return []

        path: list[Cell] = []
        cur: Cell | None = goal
        while cur is not None and cur != start:
            path.append(cur)
            cur = prev[cur]
        path.reverse()
        return path

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
    Deterministic route:
      floor 3 -> right stairs -> floor 4 -> left stairs -> floor 3 -> repeat
    """

    def __init__(self, floor_maps: dict[int, FloorMap], start_floor: int = 3):
        self.floor_maps = floor_maps
        self.floor_map = floor_maps[start_floor]

        if start_floor == 3:
            self.current = self._snap_to_walkable(Cell(38, 50))
            self.phase = 0  # 0 = floor 3 right stairs, 1 = floor 4 left stairs
        else:
            self.current = self.floor_map.random_spawn_cell()
            self.phase = 1

        self.path: list[Cell] = []
        self.target: Cell | None = None
        self.last_step: tuple[int, int] | None = None
        self.pause_until = 0.0
        self._plan_route()

    def _snap_to_walkable(self, seed: Cell) -> Cell:
        if self.floor_map.is_walkable(seed.row, seed.col):
            return seed
        return min(
            (Cell(int(r), int(c)) for r, c in self.floor_map.primary_cells),
            key=lambda cell: abs(cell.row - seed.row) + abs(cell.col - seed.col),
        )

    def _route_side(self) -> str:
        return "right" if self.phase == 0 else "left"

    def _plan_route(self) -> None:
        side = self._route_side()
        self.target = self.floor_map.nearest_stair_cell(side, self.current)
        self.path = self.floor_map.shortest_path(self.current, self.target)

        if not self.path and self.current != self.target:
            self.target = self.floor_map.random_target_cell(self.current)
            self.path = self.floor_map.shortest_path(self.current, self.target)

    def _transition_floor(self, now: float) -> None:
        """
        Move to the corresponding stair area on the other floor.
        """
        if self.floor_map.floor == 3 and self.phase == 0:
            # floor 3 right stairs -> floor 4 right stairs
            self.floor_map = self.floor_maps[4]
            self.current = self.floor_map.nearest_stair_cell("right", self.current)
            self.phase = 1

        elif self.floor_map.floor == 4 and self.phase == 1:
            # floor 4 left stairs -> floor 3 left stairs
            self.floor_map = self.floor_maps[3]
            self.current = self.floor_map.nearest_stair_cell("left", self.current)
            self.phase = 0

        else:
            # Safety fallback
            self._plan_route()
            return

        self.path = []
        self._plan_route()
        self.pause_until = now + 0.6

    def advance(self) -> tuple[Cell, bool]:
        now = time.monotonic()

        if now < self.pause_until:
            return self.current, False

        if not self.path:
            self._plan_route()

        if self.path:
            prev = self.current
            self.current = self.path.pop(0)
            self.last_step = (self.current.row - prev.row, self.current.col - prev.col)

            # Hard floor transition when the target is reached.
            # Do NOT depend on map_value == 2 here.
            if self.current == self.target:
                if (self.floor_map.floor == 3 and self.phase == 0) or (
                    self.floor_map.floor == 4 and self.phase == 1
                ):
                    self._transition_floor(now)
                    return self.current, True

                self.pause_until = now + random.uniform(0.15, 0.35)
                self._plan_route()
                return self.current, False

            return self.current, True

        # Safety fallback
        self.current = self.floor_map.random_spawn_cell()
        self._plan_route()
        self.last_step = None
        return self.current, True


class ScriptedFloorNavigator:
    """
    Deterministic, NON-looping route driven by an ordered list of legs — used by
    the opt-in SCENARIO mode. Exposes the same surface the rest of the code reads
    off a navigator (`.floor_map`, `.current`, `.path`, `.advance()`), so a
    SimulatedDevice can drive it interchangeably with FloorNavigator.

    Each leg is one of:
      ("goto", floor, side)        -> BFS to the nearest stair cell (`side`,
                                      "left"/"right") on the current floor, reusing
                                      FloorMap.nearest_stair_cell + shortest_path.
      ("transition", floor, side)  -> hard floor swap to `floor`, arriving at that
                                      floor's `side` stair cell — mirrors
                                      FloorNavigator._transition_floor, including
                                      the brief settle pause.

    Once the final leg's target is reached the navigator becomes terminal:
    advance() keeps returning the same cell with moved=False forever, so the
    device publishes a stationary position and its dot stays on the dashboard
    ("moves ... and stops there").
    """

    def __init__(
        self,
        floor_maps: dict[int, FloorMap],
        start_floor: int,
        start_cell: Cell,
        legs: list[tuple],
    ):
        self.floor_maps = floor_maps
        self.floor_map = floor_maps[start_floor]
        self.current = self._snap_to_walkable(start_cell)
        self.legs = list(legs)
        self.leg_index = 0
        self.path: list[Cell] = []
        self.target: Cell | None = None
        self.last_step: tuple[int, int] | None = None
        self.pause_until = 0.0
        self.done = False
        self._begin_leg()

    def _snap_to_walkable(self, seed: Cell) -> Cell:
        if self.floor_map.is_walkable(seed.row, seed.col):
            return seed
        return min(
            (Cell(int(r), int(c)) for r, c in self.floor_map.primary_cells),
            key=lambda cell: abs(cell.row - seed.row) + abs(cell.col - seed.col),
        )

    def _do_transition(self, floor: int, side: str) -> None:
        self.floor_map = self.floor_maps[floor]
        self.current = self.floor_map.nearest_stair_cell(side, self.current)
        self.pause_until = time.monotonic() + 0.6

    def _begin_leg(self) -> None:
        """
        Plan the leg at self.leg_index. Transition legs (and already-satisfied
        goto legs) are consumed inline until a walkable leg with a real path is
        found, or the route runs out (-> terminal).
        """
        while self.leg_index < len(self.legs):
            leg = self.legs[self.leg_index]
            kind = leg[0]

            if kind == "goto":
                _, _floor, side = leg
                self.target = self.floor_map.nearest_stair_cell(side, self.current)
                self.path = self.floor_map.shortest_path(self.current, self.target)
                if self.path:
                    return
                # Already at (or unreachable from) the target — nothing to walk.
                self.leg_index += 1
                continue

            if kind == "transition":
                _, floor, side = leg
                self._do_transition(floor, side)
                self.leg_index += 1
                continue

            # Unknown leg kind — skip defensively.
            self.leg_index += 1

        # No walkable legs remain.
        self.path = []
        self.target = None
        self.done = True

    def advance(self) -> tuple[Cell, bool]:
        now = time.monotonic()

        if self.done:
            self.last_step = None
            return self.current, False

        if now < self.pause_until:
            return self.current, False

        if not self.path:
            # Current leg finished — move on to the next one.
            self.leg_index += 1
            self._begin_leg()
            if self.done:
                return self.current, False
            if now < self.pause_until:
                # A transition just happened; honor its settle pause this tick.
                return self.current, False

        if self.path:
            prev = self.current
            self.current = self.path.pop(0)
            self.last_step = (self.current.row - prev.row, self.current.col - prev.col)
            return self.current, True

        return self.current, False


# ── MQTT-capable simulated device ─────────────────────────────────────────────
class SimulatedDevice:
    def __init__(
        self,
        device_id: str,
        floor_maps: dict[int, FloorMap],
        navigator: "FloorNavigator | ScriptedFloorNavigator | None" = None,
    ):
        self.device_id = device_id
        self.floor_maps = floor_maps
        # Scenario mode passes a pre-built ScriptedFloorNavigator; the default
        # path keeps the original looping FloorNavigator.
        self.navigator = navigator if navigator is not None else FloorNavigator(floor_maps, start_floor=3)
        self.battery = random.randint(55, 100)
        # Fractional cells-of-progress toward the next queued path cell,
        # carried across ticks — see step_position()'s docstring.
        self._progress = 0.0

    @property
    def floor_map(self) -> FloorMap:
        return self.navigator.floor_map

    @property
    def position_topic(self) -> str:
        return f"ips/{BUILDING_ID}/device/{self.device_id}/position"

    @property
    def status_topic(self) -> str:
        return f"ips/{BUILDING_ID}/device/{self.device_id}/status"

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
        Advance by a real distance this tick — WALK_SPEED_MPS * (tick
        duration), converted through this floor's meters_per_cell — instead
        of always hopping exactly one grid cell regardless of what that cell
        physically represents. That old behavior is exactly the "arbitrary
        grid jump" this replaces: once cells are calibrated to real meters
        (~0.195m each here), one cell per 0.5s tick would be a ~0.4 m/s
        crawl, and on a coarser grid the same logic could just as easily
        sprint.

        Mechanism: `_progress` accumulates fractional cells-of-budget each
        tick and persists across ticks (so a slow speed / fine grid doesn't
        lose progress between ticks — it just takes a few ticks to
        accumulate a whole cell). Whenever it reaches >= 1.0, we consume a
        real whole-cell hop via the navigator's existing BFS-pathed
        advance() (unchanged — this still handles stairs, floor transitions,
        and pausing exactly as before), possibly several in one tick on a
        fine grid at a brisk pace. Whatever fractional budget is left over
        (always < 1.0) is used to linearly interpolate the *reported*
        position toward the next queued path cell, without actually
        consuming it yet — so the published position moves smoothly between
        whole-cell waypoints rather than only ever snapping to cell centers.

        grid_row/grid_col/zone_id/room_id stay based on the last whole cell
        reached (those are lookups that need an integer cell); x/y become
        the continuous, sub-cell real-meter position.
        """
        mpc = self.floor_map.meters_per_cell
        speed = WALK_SPEED_MPS * random.uniform(1 - WALK_SPEED_JITTER, 1 + WALK_SPEED_JITTER)
        self._progress += (speed * POSITION_INTERVAL_SECONDS) / mpc

        moved_any = False
        last_cell = self.navigator.current
        while self._progress >= 1.0:
            prev_cell = self.navigator.current
            cell, moved = self.navigator.advance()
            if cell == prev_cell:
                # Genuinely blocked this instant (mid-pause window, e.g. the
                # 0.6s settle right after a floor transition) — stop, and
                # cap the budget so a long pause doesn't release a big burst
                # of hops the moment it ends.
                self._progress = min(self._progress, 1.0)
                break
            last_cell = cell
            self._progress -= 1.0
            moved_any = moved_any or moved

        next_cell = self.navigator.path[0] if self.navigator.path else None
        if next_cell is not None and self._progress > 0:
            frac_row = last_cell.row + (next_cell.row - last_cell.row) * self._progress
            frac_col = last_cell.col + (next_cell.col - last_cell.col) * self._progress
        else:
            frac_row, frac_col = float(last_cell.row), float(last_cell.col)

        jitter_row = random.uniform(-1, 1) * (POSITION_JITTER_METERS / mpc)
        jitter_col = random.uniform(-1, 1) * (POSITION_JITTER_METERS / mpc)

        x = (frac_col + jitter_col - self.floor_map.origin_col) * mpc
        y = (frac_row + jitter_row - self.floor_map.origin_row) * mpc
        accuracy = round(random.uniform(ACCURACY_METERS_MIN, ACCURACY_METERS_MAX), 2)

        payload = {
            "device_id": self.device_id,
            "building_id": BUILDING_ID,
            "floor": self.floor,
            "zone_id": self.zone_id(last_cell.row, last_cell.col),
            "room_id": self.floor_map.nearest_room_id(last_cell.col),
            "grid_row": last_cell.row,
            "grid_col": last_cell.col,
            "map_value": self.floor_map.cell_value(last_cell.row, last_cell.col),
            "x": round(x, 2),
            "y": round(y, 2),
            "accuracy": accuracy,
            "motion": "walking" if moved_any else "stationary",
            "ts": int(time.time()),
            "units": "meters",
        }
        return payload, moved_any

    def status_payload(self) -> dict:
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
                    retain=False,
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
def build_scenario_devices(floor_maps: dict[int, FloorMap]) -> list[SimulatedDevice]:
    """
    SCENARIO=corridor458: three users start in the floor-4 corridor in front of
    room 458, then:
      • user 1 walks right to the floor-4 right stairs and stops;
      • users 2 & 3 walk left to the floor-4 left stairs, descend to floor 3,
        walk right to the floor-3 right stairs, and stop.
    """
    for required in (3, 4):
        if required not in floor_maps:
            raise RuntimeError(
                f"Scenario '{SCENARIO}' needs floor {required} loaded "
                f"(set FLOORS=3,4)."
            )

    f4 = floor_maps[4]
    if SCENARIO_START_ROW is not None:
        start_row = int(SCENARIO_START_ROW)
    elif f4.corridor_rows:
        row_start, row_end = f4.corridor_rows
        start_row = (row_start + row_end) // 2
    else:
        start_row = f4.rows // 2

    # Route legs per user (see docstring). Users 2 & 3 share the same route.
    right_route = [("goto", 4, "right")]
    left_down_route = [
        ("goto", 4, "left"),
        ("transition", 3, "left"),
        ("goto", 3, "right"),
    ]
    routes = [right_route, left_down_route, left_down_route]
    offsets = [-SCENARIO_OFFSET_STEP, 0, SCENARIO_OFFSET_STEP]

    # Random per-session device ids (same convention as the fleet path) — each is
    # generated once here and stays with the user for the whole run.
    device_ids = make_device_ids(len(routes))

    devices: list[SimulatedDevice] = []
    for device_id, offset, legs in zip(device_ids, offsets, routes):
        start_cell = Cell(start_row, SCENARIO_START_COL + offset)
        navigator = ScriptedFloorNavigator(
            floor_maps, start_floor=4, start_cell=start_cell, legs=legs
        )
        devices.append(SimulatedDevice(device_id, floor_maps, navigator=navigator))
    return devices


def build_devices(floor_maps: dict[int, FloorMap]) -> list[SimulatedDevice]:
    if not floor_maps:
        raise RuntimeError("No available floors were loaded.")

    if SCENARIO:
        return build_scenario_devices(floor_maps)

    device_ids = make_device_ids(NUM_DEVICES)
    return [SimulatedDevice(did, floor_maps) for did in device_ids]


async def run_once(floor_maps: dict[int, FloorMap]) -> None:
    devices = build_devices(floor_maps)

    # Scenario mode always builds its own fixed fleet regardless of NUM_DEVICES,
    # so treat it like the multi-device path (own client id + periodic stats).
    single_device = (NUM_DEVICES == 1) and not SCENARIO

    if single_device:
        client_identifier = devices[0].device_id
    elif SCENARIO:
        client_identifier = f"sim-scenario-{SCENARIO}-{uuid.uuid4().hex[:6]}"
    else:
        client_identifier = f"sim-fleet-{uuid.uuid4().hex[:8]}"

    async with aiomqtt.Client(
        hostname=MQTT_HOST,
        port=MQTT_PORT,
        identifier=client_identifier,
    ) as client:
        print(f"[CONN]   Connected to {MQTT_HOST}:{MQTT_PORT} as {client_identifier}")
        if SCENARIO:
            print(f"[SIM]    Scenario '{SCENARIO}': {len(devices)} scripted user(s)")
        print(
            f"[SIM]    Simulating {len(devices)} device(s) on floors "
            f"{sorted({d.floor for d in devices})}"
        )
        if single_device:
            print(f"[SIM]    Device ID: {devices[0].device_id}")

        tasks = [asyncio.create_task(device.run(client), name=device.device_id) for device in devices]
        tasks.append(asyncio.create_task(listen_for_messages(client), name="listener"))
        if not single_device:
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
            pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[BOOT]   Stopped by user.")