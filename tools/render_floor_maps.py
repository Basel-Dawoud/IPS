"""
tools/render_floor_maps.py

Offline build utility — NOT part of the running dashboard or server.
Converts the real floor grid arrays (.npy) into blueprint-styled PNGs, and
keeps server/floors.json in sync with each floor's real dimensions.

Re-run this whenever the navigation team regenerates floor_*_grid.npy.

floors.json is the single source of truth for floor metadata, served by
the backend at GET /floors. This script only ever touches the `cols`,
`rows`, and `image` fields — it never overwrites `meters_per_cell` or
`origin`, since those are manually calibrated values (see the in-dashboard
calibration tool) that must survive across re-renders.

Grid cell values (observed in the current files):
    0 = open / walkable floor
    1 = wall / structure
    2 = tagged zone, type 2   (semantics not yet confirmed by nav team)
    3 = tagged zone, type 3   (semantics not yet confirmed by nav team)

Usage:
    python tools/render_floor_maps.py
"""

import json
import os

import numpy as np
from PIL import Image

# ── Source grids ──────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(__file__))

GRIDS = {
    "3": os.path.join(BASE_DIR, "maps", "floor_3_grid.npy"),
    "4": os.path.join(BASE_DIR, "maps", "floor_4_grid.npy"),
}

ASSETS_DIR = os.path.join(BASE_DIR, "dashboard", "assets")
FLOORS_JSON_PATH = os.path.join(BASE_DIR, "server", "floors.json")

# ── Blueprint palette (matches dashboard CSS tokens — keep these in sync) ─────
COLOR_OPEN       = (14, 42, 61, 255)    # #0E2A3D — cyanotype floor surface
COLOR_WALL       = (232, 222, 200, 255) # #E8DEC8 — cream linework
COLOR_ZONE_TYPE2 = (31, 169, 199, 255)  # #1FA9C7 — teal, tagged zone type 2
COLOR_ZONE_TYPE3 = (242, 163, 60, 255)  # #F2A33C — amber, tagged zone type 3

VALUE_TO_COLOR = {0: COLOR_OPEN, 1: COLOR_WALL, 2: COLOR_ZONE_TYPE2, 3: COLOR_ZONE_TYPE3}

UPSCALE = 4  # nearest-neighbor upscale for crisp lines at large display sizes


def render(grid_path: str, out_path: str) -> tuple[int, int]:
    grid = np.load(grid_path)
    rows, cols = grid.shape

    rgba = np.zeros((rows, cols, 4), dtype=np.uint8)
    for value, color in VALUE_TO_COLOR.items():
        rgba[grid == value] = color

    img = Image.fromarray(rgba, mode="RGBA")
    img = img.resize((cols * UPSCALE, rows * UPSCALE), Image.NEAREST)
    img.save(out_path)
    print(f"Wrote {out_path}  ({cols}x{rows} cells -> {img.width}x{img.height}px)")
    return cols, rows


def load_existing_floors_config() -> dict:
    if os.path.exists(FLOORS_JSON_PATH):
        with open(FLOORS_JSON_PATH) as f:
            return json.load(f)
    return {}


def main():
    os.makedirs(ASSETS_DIR, exist_ok=True)
    config = load_existing_floors_config()

    for floor, grid_path in GRIDS.items():
        out_path = os.path.join(ASSETS_DIR, f"floor_{floor}.png")
        cols, rows = render(grid_path, out_path)

        existing = config.get(floor, {})
        config[floor] = {
            "cols": cols,
            "rows": rows,
            "image": f"assets/floor_{floor}.png",
            # Preserved across re-renders — only set manually via the
            # dashboard's calibration tool, never overwritten here.
            "meters_per_cell": existing.get("meters_per_cell"),
            "origin": existing.get("origin", {"col": 0, "row": 0}),
        }

    os.makedirs(os.path.dirname(FLOORS_JSON_PATH), exist_ok=True)
    with open(FLOORS_JSON_PATH, "w") as f:
        json.dump(config, f, indent=2)

    print(f"\nUpdated {FLOORS_JSON_PATH}:")
    print(json.dumps(config, indent=2))


if __name__ == "__main__":
    main()
