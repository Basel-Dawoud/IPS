"""Store recommendation based on location and history."""
import numpy as np
from models.store import RoomInfo, StoreMapper
from database.operations import get_most_visited_store
from config import STORE_CLUSTER_ROOM


class StoreRecommender:
    """Recommends stores based on user location and visit history."""

    def __init__(self):
        self.store_mapper = StoreMapper()

    def nearest_store(self, user_pos, user_floor):
        """Find nearest store to user position on same floor."""
        from config import room_centroids_f3_grid, room_centroids_f4_grid

        best_room = None
        best_dist = float("inf")

        centroids = room_centroids_f3_grid if user_floor == 0 else room_centroids_f4_grid

        for room, centroid in centroids.items():
            if RoomInfo.get_floor(room) != user_floor:
                continue

            dist = np.sqrt((user_pos[0] - centroid[0]) ** 2 + (user_pos[1] - centroid[1]) ** 2)
            if dist < best_dist:
                best_dist = dist
                best_room = room

        return best_room

    def recommend_for_user(self, username, user_pos, user_floor, is_new=True):
        """Get store recommendation for a user."""
        if is_new:
            room = self.nearest_store(user_pos, user_floor)
            msg = "🆕 New user → Nearest store recommended"
        else:
            room = get_most_visited_store(username)
            if room is None:
                room = self.nearest_store(user_pos, user_floor)
            msg = "🔁 Returning user → Most visited store recommended"

        store_name = RoomInfo.get_name(room)
        return room, store_name, msg
