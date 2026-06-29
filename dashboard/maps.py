#!/usr/bin/env python3
"""
inspect_floor_maps.py

Completely inspects every floor map (.npy) used by the IPS project.

Shows:
    • shape
    • rows / cols
    • datatype
    • min/max values
    • unique values
    • count of each value
    • percentage occupied by each value
    • walkable cells
    • bounding box
    • sample values
    • ASCII preview
    • graphical visualization
"""

from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap

# --------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

MAPS = {
    "Floor 3": BASE_DIR / "maps" / "floor_3_grid.npy",
    "Floor 4": BASE_DIR / "maps" / "floor_4_grid.npy",
}

# --------------------------------------------------------------------

SYMBOLS = {
    0: ".",
    1: "#",
    2: "2",
    3: "3",
}

COLORS = [
    "#0E2A3D",   # 0
    "#E8DEC8",   # 1
    "#1FA9C7",   # 2
    "#F2A33C",   # 3
]

# --------------------------------------------------------------------


def print_header(title):
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)


def ascii_preview(grid, rows=25, cols=80):
    print("\nASCII preview\n")

    r = min(rows, grid.shape[0])
    c = min(cols, grid.shape[1])

    for row in grid[:r]:
        print("".join(SYMBOLS.get(v, "?") for v in row[:c]))


def inspect(path: Path):

    print_header(path.name)

    grid = np.load(path)

    rows, cols = grid.shape

    print("Shape           :", grid.shape)
    print("Rows            :", rows)
    print("Columns         :", cols)
    print("Total Cells     :", rows * cols)
    print("Data Type       :", grid.dtype)
    print("Min Value       :", grid.min())
    print("Max Value       :", grid.max())

    unique, counts = np.unique(grid, return_counts=True)

    print("\nUnique values\n")

    for value, count in zip(unique, counts):
        percent = count / grid.size * 100

        print(
            f"Value {value:<2} "
            f"Count={count:<8} "
            f"{percent:6.2f}%"
        )

    print()

    walkable = np.argwhere(grid == 0)

    print("Walkable Cells  :", len(walkable))

    if len(walkable):

        min_row = walkable[:, 0].min()
        max_row = walkable[:, 0].max()

        min_col = walkable[:, 1].min()
        max_col = walkable[:, 1].max()

        print("Bounding Box")

        print(f"Rows : {min_row} -> {max_row}")
        print(f"Cols : {min_col} -> {max_col}")

    print("\nFirst 20 walkable cells\n")

    print(walkable[:20])

    print("\nTop-left 15x15 sample\n")

    print(grid[:15, :15])

    ascii_preview(grid)

    # ---------------- Visualization ----------------

    fig = plt.figure(figsize=(18, 7))

    fig.suptitle(path.name, fontsize=18)

    ax1 = plt.subplot(121)

    cmap = ListedColormap(COLORS)

    img = ax1.imshow(
        grid,
        cmap=cmap,
        interpolation="nearest",
        origin="upper",
    )

    ax1.set_title("Dashboard-style Colors")
    ax1.set_xlabel("Columns")
    ax1.set_ylabel("Rows")

    cbar = plt.colorbar(img)

    cbar.set_ticks(unique)
    cbar.set_ticklabels([str(v) for v in unique])

    # ------------------------------------------------

    ax2 = plt.subplot(122)

    walk = np.where(grid == 0, 1, 0)

    ax2.imshow(
        walk,
        cmap="gray",
        interpolation="nearest",
        origin="upper",
    )

    ax2.set_title("Walkable Cells")
    ax2.set_xlabel("Columns")
    ax2.set_ylabel("Rows")

    plt.tight_layout()

    plt.show()


def main():

    for floor, path in MAPS.items():

        if not path.exists():

            print(f"{path} not found")

            continue

        inspect(path)


if __name__ == "__main__":
    main()