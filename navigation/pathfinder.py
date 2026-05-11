"""A* pathfinding implementation for mall navigation."""
import heapq
import numpy as np
from config import room_centroids_f3_grid, room_centroids_f4_grid


class Pathfinder:
    """A* pathfinding with support for multiple navigation modes."""

    def __init__(self, grid_manager):
        self.grid_mgr = grid_manager

    def _heuristic(self, a, b):
        """Calculate heuristic distance between nodes."""
        return abs(a[1] - b[1]) + abs(a[2] - b[2]) + abs(a[0] - b[0]) * 10

    def _get_neighbors(self, node, mode="Normal"):
        """Get valid neighbors for a node with mode-specific costs."""
        floor, r, c = node
        grid = self.grid_mgr.get_grid(floor)
        moves = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        result = []

        for dr, dc in moves:
            nr = r + dr
            nc = c + dc
            if 0 <= nr < grid.shape[0] and 0 <= nc < grid.shape[1]:
                cell = grid[nr, nc]
                if cell == 1:  # Wall
                    continue

                cost = 1

                # Fire danger penalty
                if self.grid_mgr.fire_active and self.grid_mgr.fire_center is not None:
                    fr, fc = self.grid_mgr.fire_center
                    dist = np.sqrt((nr - fr) ** 2 + (nc - fc) ** 2)
                    if dist < 120:
                        cost += (120 - dist) * 0.3

                # Stair penalty
                if cell == 4:
                    cost += 8

                # Crowd penalties
                if mode == "Crowded":
                    if cell == 5:
                        cost += 200
                    elif cell == 6:
                        cost += 40

                # Special needs penalty for stairs
                if mode == "Special Needs" and cell == 4:
                    cost += 100

                result.append(((floor, int(nr), int(nc)), cost))

        # Floor transitions
        is_stair = self.grid_mgr.is_stair(floor, r, c)
        is_elevator = self.grid_mgr.is_elevator(floor, r, c)

        if mode == "Special Needs":
            if is_elevator:
                for f in [0, 1]:
                    if f != floor:
                        nearest_elev = self.grid_mgr.find_nearest_elevator(f, r, c)
                        if nearest_elev:
                            er, ec = nearest_elev
                            dest_grid = self.grid_mgr.get_grid(f)
                            cr, cc = self.grid_mgr.find_nearest_free(dest_grid, er, ec)
                            result.append(((f, cr, cc), 10))
        else:
            if is_stair:
                sid = self.grid_mgr.get_stair_id(floor, r, c)
                cost = 15 if mode != "Crowded" else 40

                # Fire penalty for stairs
                if self.grid_mgr.fire_active and self.grid_mgr.fire_center is not None:
                    fr, fc = self.grid_mgr.fire_center
                    dist = np.sqrt((r - fr) ** 2 + (c - fc) ** 2)
                    if dist < 150:
                        cost += 200

                for f in self.grid_mgr.stairs.get(sid, {}).get("floors", []):
                    if f != floor:
                        result.append(((f, r, c), cost))

        return result

    def find_path(self, start, goal, mode="Normal"):
        """Find path using A* algorithm."""
        open_set = []
        heapq.heappush(open_set, (0, start))
        came_from = {}
        g_score = {start: 0}

        while open_set:
            _, current = heapq.heappop(open_set)

            if current == goal:
                path = []
                while current in came_from:
                    path.append(current)
                    current = came_from[current]
                path.append(start)
                return path[::-1]

            for neighbor, cost in self._get_neighbors(current, mode):
                tentative_g = g_score[current] + cost
                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    g_score[neighbor] = tentative_g
                    f_score = tentative_g + self._heuristic(neighbor, goal)
                    heapq.heappush(open_set, (f_score, neighbor))
                    came_from[neighbor] = current

        return None

    def get_centroid(self, room: int):
        """Get centroid coordinates for a room."""
        if room in room_centroids_f3_grid:
            return room_centroids_f3_grid[room]
        if room in room_centroids_f4_grid:
            return room_centroids_f4_grid[room]
        return None

    def prepare_points(self, start_floor, start_xy, dest_room):
        """Prepare start and goal points for navigation."""
        from models.store import RoomInfo

        # Start point
        sf = int(start_floor)
        start_grid = self.grid_mgr.get_grid(sf)
        sr, sc = self.grid_mgr.clamp_point(start_xy[0], start_xy[1], start_grid)
        sr, sc = self.grid_mgr.find_nearest_free(start_grid, sr, sc)
        start = (sf, sr, sc)

        # Goal point
        df = RoomInfo.get_floor(dest_room)
        dc = self.get_centroid(dest_room)
        if dc is None:
            return None, None, "❌ Could not find room centroid."

        goal_grid = self.grid_mgr.get_grid(df)
        gr, gc = self.grid_mgr.clamp_point(dc[0], dc[1], goal_grid)
        gr, gc = self.grid_mgr.find_nearest_free(goal_grid, gr, gc)
        goal = (df, gr, gc)

        return start, goal, None
