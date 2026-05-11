"""Grid loading, danger marking, and elevator/stair management."""
import numpy as np
from scipy.ndimage import label, distance_transform_edt
from config import GRID_0_FILE, GRID_1_FILE, CELL_SIZE


class GridManager:
    """Manages floor grids, stairs, elevators, and danger zones."""

    def __init__(self):
        self.grid_0 = None
        self.grid_1 = None
        self.stairs = {}
        self.stair_cells = {0: {}, 1: {}}
        self.elevator_cells = {0: set(), 1: set()}
        self.fire_active = False
        self.fire_room = None
        self.fire_step = 0
        self.fire_center = None
        self.crowded_active = False
        self.crowded_room = None
        self.crowded_center = None
        self._load_grids()
        self._extract_stairs()
        self._extract_elevators()
        self.apply_room_clearance()

    def _load_grids(self):
        """Load grid files from disk."""
        try:
            self.grid_0 = np.load(GRID_0_FILE)
            self.grid_1 = np.load(GRID_1_FILE)
        except Exception as e:
            print(f"⚠️ Could not load grid files: {e}")
            # Create dummy grids for testing
            self.grid_0 = np.zeros((500, 500), dtype=np.uint8)
            self.grid_1 = np.zeros((500, 500), dtype=np.uint8)

    def _extract_stairs(self):
        """Extract stairway cells from grids."""
        for floor_idx, grid in [(0, self.grid_0), (1, self.grid_1)]:
            binary = (grid == 2).astype(int)
            labeled, num = label(binary)
            for i in range(1, num + 1):
                sid = f"S{i}"
                self.stairs[sid] = {"floors": [0, 1]}
                for r, c in np.argwhere(labeled == i):
                    self.stair_cells[floor_idx][(int(r), int(c))] = sid

    def _extract_elevators(self):
        """Extract elevator cells from grids."""
        for floor_idx, grid in [(0, self.grid_0), (1, self.grid_1)]:
            coords = np.argwhere(grid == 3)
            for r, c in coords:
                self.elevator_cells[floor_idx].add((int(r), int(c)))

    def apply_room_clearance(self):
        """Apply clearance around room centroids."""
        from config import room_centroids_f3_grid, room_centroids_f4_grid

        # Floor 3 clearance
        for r, c in room_centroids_f3_grid.values():
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < self.grid_0.shape[0] and 0 <= cc < self.grid_0.shape[1]:
                        self.grid_0[rr, cc] = 0

        # Floor 4 clearance
        for r, c in room_centroids_f4_grid.values():
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < self.grid_1.shape[0] and 0 <= cc < self.grid_1.shape[1]:
                        self.grid_1[rr, cc] = 0

    def reset_grids(self):
        """Reset grids to original state and reapply clearance."""
        self._load_grids()
        self._extract_stairs()
        self._extract_elevators()
        self.apply_room_clearance()
        self.fire_active = False
        self.crowded_active = False

    def get_grid(self, floor: int):
        """Get grid for a specific floor."""
        return self.grid_0 if floor == 0 else self.grid_1

    def clamp_point(self, x, y, grid):
        """Clamp coordinates to grid bounds."""
        r = int(max(0, min(grid.shape[0] - 1, round(float(x)))))
        c = int(max(0, min(grid.shape[1] - 1, round(float(y)))))
        return r, c

    def find_nearest_free(self, grid, r, c):
        """Find nearest free cell using distance transform."""
        free = (grid == 0)
        _, ind = distance_transform_edt(~free, return_indices=True)
        nr, nc = ind[:, r, c]
        return int(nr), int(nc)

    def find_nearest_elevator(self, floor: int, r: int, c: int):
        """Find nearest elevator on a given floor."""
        cells = list(self.elevator_cells.get(floor, []))
        if not cells:
            return None
        return min(cells, key=lambda p: (p[0] - r) ** 2 + (p[1] - c) ** 2)

    def is_stair(self, floor: int, r: int, c: int) -> bool:
        """Check if position is a stairway."""
        return (r, c) in self.stair_cells.get(floor, {})

    def is_elevator(self, floor: int, r: int, c: int) -> bool:
        """Check if position is an elevator."""
        return (r, c) in self.elevator_cells.get(floor, set())

    def get_stair_id(self, floor: int, r: int, c: int) -> str | None:
        """Get stair ID at position."""
        return self.stair_cells.get(floor, {}).get((r, c))

    def mark_danger(self, grid, centroid, radius=20):
        """Mark danger zone around a centroid."""
        r0, c0 = centroid
        for i in range(grid.shape[0]):
            for j in range(grid.shape[1]):
                dist = np.sqrt((i - r0) ** 2 + (j - c0) ** 2)
                if dist < radius:
                    grid[i, j] = 1

    def mark_crowd(self, grid, centroid, room_radius=15, corridor_radius=40):
        """Mark crowd zones around a centroid."""
        r0, c0 = centroid
        for i in range(grid.shape[0]):
            for j in range(grid.shape[1]):
                dist = np.sqrt((i - r0) ** 2 + (j - c0) ** 2)
                if dist < room_radius:
                    grid[i, j] = 5
                elif dist < corridor_radius and grid[i, j] == 0:
                    grid[i, j] = 6

    def activate_fire(self, room: int, centroid: tuple):
        """Activate fire danger mode for a room."""
        self.fire_active = True
        self.fire_room = room
        self.fire_center = centroid
        self.fire_step += 1
        radius = 20 + self.fire_step * 6

        from models.store import RoomInfo
        floor = RoomInfo.get_floor(room)
        grid = self.get_grid(floor)
        self.mark_danger(grid, centroid, radius)

    def activate_crowd(self, room: int, centroid: tuple):
        """Activate crowd avoidance mode for a room."""
        self.crowded_active = True
        self.crowded_room = room
        self.crowded_center = centroid

        from models.store import RoomInfo
        floor = RoomInfo.get_floor(room)
        grid = self.get_grid(floor)
        self.mark_crowd(grid, centroid)

    def clear_danger(self):
        """Clear all danger modes and reset grids."""
        self.fire_active = False
        self.crowded_active = False
        self.fire_room = None
        self.crowded_room = None
        self.fire_center = None
        self.crowded_center = None
        self.reset_grids()
