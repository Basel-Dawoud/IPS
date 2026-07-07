"""
tools/floor_geometry.py

Shared geometry engine for the IPS floor maps. Used by:
  - tools/render_floor_maps.py   (writes floors.json, SVG assets, DB room seed)
  - phone.py                      (reads floors.json's corridor_rows at runtime)

Responsibilities:
  1. Detect the main corridor band on a floor automatically from the raw grid.
  2. Detect the column boundaries of the bottom-row rooms automatically.
  3. Divide the corridor band itself into evenly-spaced heatmap tiles
     (CorridorSegment), so foot traffic *walking the corridor* can be
     visualized on its own floor surface — not just attributed to the
     nearest shop.
  4. Hold the canonical, human-provided room number/name directory — this is
     real-world business data that cannot be derived from the grid, so it is
     deliberately kept as plain configuration here rather than inferred.
  5. Render a lossless SVG floor plan with room labels baked in, Google-Maps
     style, anchored at the bottom of each labeled room.

Design note on the split between "detected" and "configured" data:
  Geometry (corridor band, wall positions, block boundaries) is algorithmic
  and reproducible — if the .npy grids are regenerated, rerunning this module
  recomputes it correctly with no manual intervention.
  Room numbers and store names are ground truth nobody can derive from a
  grid of integers — they are configuration, matched to detected blocks by
  left-to-right position, with explicit None entries for unlabeled/non-room
  blocks (e.g. block 5 on floor 3, entrances, stairwells).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from xml.sax.saxutils import escape as xml_escape

# ── Grid value semantics ───────────────────────────────────────────────────────
WALKABLE_VALUES = (0, 2, 3)   # 1 = wall, everything else treated as walkable
WALL_VALUE = 1
ZONE2_VALUE = 2
ZONE3_VALUE = 3

# ── Blueprint palette — keep these in sync with dashboard/index.html CSS vars ──
COLOR_OPEN       = "#0E2A3D"   # cyanotype floor surface
COLOR_WALL       = "#E8DEC8"   # cream linework
COLOR_ZONE2      = "#1FA9C7"   # tagged zone, type 2
COLOR_ZONE3      = "#F2A33C"   # tagged zone, type 3
COLOR_CORRIDOR_TINT = "#2DD4A7"  # signal green, used at low opacity only
COLOR_LABEL_FILL = "#101B2C"
COLOR_LABEL_EDGE = "#E8DEC8"
COLOR_LABEL_NUMBER = "#F2EFE6"
COLOR_LABEL_NAME = "#93A0AE"


# ── Canonical room directory (ground truth, not derived from the grid) ───────
# Each entry corresponds to a detected block, left to right. None = block
# exists geometrically but is not a labeled room (entrance, stairwell, a
# block narrower than a normal room, etc).
ROOM_DIRECTORY: dict[int, list[tuple[str, str] | None]] = {
    3: [
        None,                                       # block 1 — leftmost, unlabeled
        ("358", "Health & Personal Care"),
        ("357", "Laptop Accessories"),
        ("356", "Gaming"),
        None,                                       # block 5 — narrow, not a room
        ("355", "Smart Wearables"),
        ("354", "Smart Home Automation"),
        ("353", "Storage"),
        ("352", "Mobile & Tablets Hub"),
        ("351", "Computer Systems Hub"),
        ("350", "Smart Devices Hub"),
    ],
    4: [
        ("462", "Pet and Gardening"),
        ("461", "Cleaning and Bath"),
        ("460", "Lighting and Electricals"),
        ("459", "Tools and utility"),
        ("458", "Home Decor"),
        ("457", "Kitchen and Dining"),
        ("456", "Furnishings"),
        ("455", "Bathroom"),
        ("454", "Dining Room"),
        ("453", "Kitchen"),
        ("452", "Study/Office"),
        ("451", "Living Room"),
        ("450", "Bedroom"),
    ],
}


@dataclass(frozen=True)
class Room:
    room_id: str
    name: str
    floor: int
    col_start: int
    col_end: int
    row_start: int
    row_end: int

    @property
    def col_center(self) -> float:
        return (self.col_start + self.col_end) / 2

    @property
    def width(self) -> int:
        return self.col_end - self.col_start + 1


# ── Geometry detection ─────────────────────────────────────────────────────────

def detect_corridor_band(
    grid: np.ndarray,
    walkable_values=WALKABLE_VALUES,
    min_fraction: float = 0.97,
) -> tuple[int, int]:
    """
    Returns (row_start, row_end) inclusive of the longest run of rows that are
    almost entirely open (no interior dividing walls at all).

    Why this threshold works: a true corridor has zero internal walls, so its
    open-fraction sits right at the structural maximum (limited only by the
    two outer bounding walls — typically >99%). A room-block row, even during
    a long stretch with no doors interrupting it, always loses a fixed chunk
    of width to the room-dividing walls present in every row of that section.
    On real data this caps room-section rows well below 0.97 while the actual
    corridor clears it comfortably — see tools/README or commit history for
    the empirical row-profile that justified this value.
    """
    walk = np.isin(grid, walkable_values)
    rows, cols = grid.shape
    frac = walk.sum(axis=1) / cols

    best = (0, -1)
    run_start = None
    for r in range(rows):
        if frac[r] >= min_fraction:
            if run_start is None:
                run_start = r
        else:
            if run_start is not None and (r - 1 - run_start) > (best[1] - best[0]):
                best = (run_start, r - 1)
            run_start = None
    if run_start is not None and (rows - 1 - run_start) > (best[1] - best[0]):
        best = (run_start, rows - 1)

    if best[1] < best[0]:
        raise RuntimeError("Could not detect a corridor band — check grid semantics.")
    return best


def detect_column_blocks(
    grid: np.ndarray,
    row_start: int,
    row_end: int,
    walkable_values=WALKABLE_VALUES,
    wall_threshold_fraction: float = 0.15,
    min_block_width: int = 8,
) -> list[tuple[int, int]]:
    """
    Returns [(col_start, col_end), ...] inclusive, for the vertical room
    dividers within rows [row_start, row_end]. A column is treated as part of
    a wall if fewer than wall_threshold_fraction of its rows in this band are
    walkable. Blocks narrower than min_block_width are dropped as detection
    noise (door-width gaps, not real rooms).
    """
    walk = np.isin(grid, walkable_values)
    section = walk[row_start:row_end + 1, :]
    height = section.shape[0]
    col_counts = section.sum(axis=0)
    is_wall_col = (col_counts / height) < wall_threshold_fraction

    blocks: list[tuple[int, int]] = []
    c, cols = 0, len(is_wall_col)
    while c < cols:
        if is_wall_col[c]:
            c += 1
            continue
        start = c
        while c < cols and not is_wall_col[c]:
            c += 1
        end = c - 1
        if end - start + 1 >= min_block_width:
            blocks.append((start, end))
    return blocks


def build_rooms_for_floor(
    floor: int,
    grid: np.ndarray,
    corridor_band: tuple[int, int],
    *,
    row_margin_after_corridor: int = 3,
    row_margin_before_outer_wall: int = 3,
) -> tuple[list[Room], tuple[int, int]]:
    """
    Detects the bottom-row room blocks for one floor and matches them against
    ROOM_DIRECTORY by left-to-right position. Returns (rooms, (row_start, row_end))
    for the bottom section, so callers can also use the row span for label
    placement or analytics bounding boxes.
    """
    rows = grid.shape[0]
    row_start = corridor_band[1] + row_margin_after_corridor
    row_end = rows - 1 - row_margin_before_outer_wall

    blocks = detect_column_blocks(grid, row_start, row_end)
    directory = ROOM_DIRECTORY.get(floor, [])

    if len(blocks) != len(directory):
        raise RuntimeError(
            f"Floor {floor}: detected {len(blocks)} blocks but ROOM_DIRECTORY "
            f"has {len(directory)} entries. The grid changed shape/layout — "
            f"re-derive the directory before trusting these labels."
        )

    rooms: list[Room] = []
    for (col_start, col_end), entry in zip(blocks, directory):
        if entry is None:
            continue
        room_id, name = entry
        rooms.append(Room(room_id, name, floor, col_start, col_end, row_start, row_end))

    return rooms, (row_start, row_end)


@dataclass(frozen=True)
class CorridorSegment:
    """
    One tile of the corridor's OWN walkable surface — used to heat-tint the
    corridor band itself (people walking past) independently of the room
    blocks alongside it. Unlike Room, a segment has no name/business
    identity; it's pure geometry.
    """
    segment_id: str
    floor: int
    col_start: int
    col_end: int
    row_start: int
    row_end: int

    @property
    def width(self) -> int:
        return self.col_end - self.col_start + 1


# Real-world length of one corridor heatmap tile. 5m keeps tiles roughly
# proportioned against the corridor's own band width (~14 rows, ~2.7m) —
# fine enough to localize crowding along the corridor's length, coarse
# enough that a handful of devices don't paint the whole floor red. Tune
# here; tools/render_floor_maps.py re-derives tile count/width from this
# any time floor assets are regenerated, the same way ROOM_DIRECTORY
# changes flow through automatically.
CORRIDOR_SEGMENT_LENGTH_METERS = 5.0


def build_corridor_segments(
    floor: int,
    cols: int,
    corridor_band: tuple[int, int],
    meters_per_cell: float,
    segment_length_m: float = CORRIDOR_SEGMENT_LENGTH_METERS,
) -> list[CorridorSegment]:
    """
    Divides the corridor band into consecutive, full-width column tiles
    ~segment_length_m meters long each, so the corridor's own floor surface
    can be heat-tinted for foot traffic — not just the rooms beside it.

    Deliberately different from build_rooms_for_floor(): this covers
    columns [0, cols) completely and does not skip or merge around
    unlabeled blocks/gaps in the room directory. The corridor is walkable
    along its entire length regardless of what's labeled next to it, so its
    crowding map shouldn't have holes just because the shop directory does.
    Segments are spaced by real length, not aligned to room column
    boundaries — a tile can straddle two shopfronts, which is fine: this is
    a map of the corridor surface, not a per-shop statistic. The final tile
    is whatever length is left over (<= segment_length_m) rather than
    dropped or merged into its neighbor, so the tiles still cover the full
    corridor with no gap at the far end.
    """
    row_start, row_end = corridor_band
    segment_cols = max(1, round(segment_length_m / meters_per_cell))

    segments: list[CorridorSegment] = []
    idx = 0
    col = 0
    while col < cols:
        col_end = min(col + segment_cols - 1, cols - 1)
        segments.append(CorridorSegment(
            segment_id=f"{floor}-corridor-{idx:02d}",
            floor=floor,
            col_start=col,
            col_end=col_end,
            row_start=row_start,
            row_end=row_end,
        ))
        idx += 1
        col += segment_cols
    return segments


# ── SVG rendering ──────────────────────────────────────────────────────────────

def _row_run_length_rects(grid: np.ndarray) -> list[tuple[int, int, int, int]]:
    """
    Run-length encodes each row by color value, returning a list of
    (row, col_start, length, value) tuples. Keeps the SVG vector-crisp and
    small (hundreds of rects, not one per cell) by collapsing horizontal runs.
    """
    rows, cols = grid.shape
    rects: list[tuple[int, int, int, int]] = []
    for r in range(rows):
        c = 0
        row = grid[r]
        while c < cols:
            value = row[c]
            start = c
            while c < cols and row[c] == value:
                c += 1
            rects.append((r, start, c - start, int(value)))
    return rects


def _value_color(value: int) -> str:
    return {
        0: COLOR_OPEN,
        WALL_VALUE: COLOR_WALL,
        ZONE2_VALUE: COLOR_ZONE2,
        ZONE3_VALUE: COLOR_ZONE3,
    }.get(value, COLOR_OPEN)


def _wrap_name(name: str, max_chars_per_line: int) -> list[str]:
    words = name.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars_per_line or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines[:2]  # never more than 2 lines — clamp rather than overflow


def _room_label_svg(room: Room) -> str:
    """
    A small Google-Maps-style label pill: bold room number, smaller store
    name below, anchored near the bottom of the room (per the "bottom side
    only" placement requirement), centered horizontally in the block.
    """
    cx = room.col_center
    bottom_y = room.row_end - 1.5

    number_font = max(2.2, min(4.0, room.width / 9))
    name_max_chars = max(8, int(room.width / (number_font * 0.62)))
    name_lines = _wrap_name(room.name, name_max_chars)
    name_font = max(1.3, min(2.0, room.width / 16))

    line_gap = name_font * 1.25
    name_block_height = len(name_lines) * line_gap

    pill_w = min(room.width * 0.92, max(len(room.name) * name_font * 0.62, 9))
    pill_h = number_font * 1.5 + name_block_height + 1.2
    pill_x = cx - pill_w / 2
    pill_y = bottom_y - pill_h

    parts = [
        f'<g class="room-label" data-room-id="{room.room_id}">',
        f'<rect x="{pill_x:.2f}" y="{pill_y:.2f}" width="{pill_w:.2f}" height="{pill_h:.2f}" '
        f'rx="0.9" fill="{COLOR_LABEL_FILL}" fill-opacity="0.92" '
        f'stroke="{COLOR_LABEL_EDGE}" stroke-width="0.18"/>',
        f'<text x="{cx:.2f}" y="{pill_y + number_font * 1.15:.2f}" '
        f'font-family="IBM Plex Mono, monospace" font-weight="600" '
        f'font-size="{number_font:.2f}" fill="{COLOR_LABEL_NUMBER}" '
        f'text-anchor="middle">{xml_escape(room.room_id)}</text>',
    ]
    for i, line in enumerate(name_lines):
        y = pill_y + number_font * 1.6 + (i + 1) * line_gap
        parts.append(
            f'<text x="{cx:.2f}" y="{y:.2f}" font-family="Inter, sans-serif" '
            f'font-size="{name_font:.2f}" fill="{COLOR_LABEL_NAME}" '
            f'text-anchor="middle">{xml_escape(line)}</text>'
        )
    parts.append("</g>")
    return "".join(parts)


def render_floor_svg(
    grid: np.ndarray,
    rooms: list[Room],
    corridor_band: tuple[int, int],
) -> str:
    rows, cols = grid.shape
    rects = _row_run_length_rects(grid)

    rect_svg = "".join(
        f'<rect x="{col}" y="{row}" width="{length}" height="1" fill="{_value_color(value)}"/>'
        for row, col, length, value in rects
    )

    corridor_row_start, corridor_row_end = corridor_band
    corridor_height = corridor_row_end - corridor_row_start + 1
    corridor_svg = (
        f'<rect x="0" y="{corridor_row_start}" width="{cols}" height="{corridor_height}" '
        f'fill="{COLOR_CORRIDOR_TINT}" fill-opacity="0.06"/>'
        f'<line x1="0" y1="{(corridor_row_start + corridor_row_end) / 2 + 0.5}" '
        f'x2="{cols}" y2="{(corridor_row_start + corridor_row_end) / 2 + 0.5}" '
        f'stroke="{COLOR_CORRIDOR_TINT}" stroke-opacity="0.25" stroke-width="0.3" '
        f'stroke-dasharray="1.2,1.2"/>'
    )

    labels_svg = "".join(_room_label_svg(room) for room in rooms)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {cols} {rows}" '
        f'width="{cols}" height="{rows}" shape-rendering="crispEdges">'
        f"{rect_svg}{corridor_svg}{labels_svg}"
        f"</svg>"
    )
