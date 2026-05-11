"""Store and room mapping models."""
import re
from config import (
    ROOM_INFO, STORE_CLUSTER, STORE_CLUSTER_ROOM,
    STORE_ALIASES, PRODUCT_TO_ROOM
)


class RoomInfo:
    """Handles room information and lookups."""

    @staticmethod
    def get_name(room_number: int) -> str:
        """Get store name by room number."""
        return ROOM_INFO.get(room_number, f"Room {room_number}")

    @staticmethod
    def get_description(room_number: int) -> str:
        """Get store description by room number."""
        from config import STORE_DESCRIPTIONS
        return STORE_DESCRIPTIONS.get(
            room_number, 
            "Mall store information is available for this store."
        )

    @staticmethod
    def get_info(room_number: int) -> str:
        """Get formatted store information."""
        name = RoomInfo.get_name(room_number)
        desc = RoomInfo.get_description(room_number)
        return f"🏪 {name} (Room {room_number})
📝 {desc}"

    @staticmethod
    def get_floor(room_number: int) -> int:
        """Get floor index (0 for floor 3, 1 for floor 4)."""
        if 350 <= room_number <= 358:
            return 0
        if 450 <= room_number <= 462:
            return 1
        return 0

    @staticmethod
    def get_all_rooms() -> dict:
        """Get all room mappings."""
        return ROOM_INFO


class StoreMapper:
    """Handles store name/alias to room mapping and text extraction."""

    def __init__(self):
        self.name_to_room = {name.lower(): room for room, name in ROOM_INFO.items()}
        self.alias_to_room = self._build_alias_map()
        self.sub_to_category = {}
        self._load_category_mappings()

    def _build_alias_map(self):
        """Build alias to room mapping from STORE_ALIASES."""
        mapping = {}
        for room, aliases in STORE_ALIASES.items():
            for alias in aliases:
                mapping[alias.lower()] = room
        return mapping

    def _load_category_mappings(self):
        """Load category mappings from JSON files."""
        import json
        from config import CATEGORIES_FILE
        try:
            with open(CATEGORIES_FILE, "r", encoding="utf-8") as f:
                categories_data = json.load(f)
            for type_block in categories_data:
                for cat in type_block.get("categories", []):
                    for sub in cat.get("subCategories", []):
                        self.sub_to_category[sub] = cat["category"]
        except Exception:
            pass

    def find_room_in_text(self, text: str) -> int | None:
        """Extract room number from text using multiple strategies."""
        text_l = (text or "").lower()

        # Direct room numbers
        room_match = re.search(r"\b(3\d{2}|4[5-6]\d)\b", text_l)
        if room_match:
            room = int(room_match.group(1))
            if room in ROOM_INFO:
                return room

        # Store names (longest match first)
        for name, room in sorted(self.name_to_room.items(), key=lambda x: len(x[0]), reverse=True):
            if name in text_l:
                return room

        # Aliases
        for alias, room in sorted(self.alias_to_room.items(), key=lambda x: len(x[0]), reverse=True):
            if alias in text_l:
                return room

        # Product keywords
        for keyword, room in sorted(PRODUCT_TO_ROOM.items(), key=lambda x: len(x[0]), reverse=True):
            if keyword in text_l:
                return room

        return None

    def find_rooms_in_text(self, text: str) -> list[int]:
        """Find all room numbers mentioned in text."""
        text_l = (text or "").lower()
        found = re.findall(r"\b(3\d{2}|4[5-6]\d)\b", text_l)
        return [int(r) for r in found if int(r) in ROOM_INFO]

    def extract_start_and_dest(self, text: str) -> tuple[int | None, int | None]:
        """Extract start and destination rooms from navigation text."""
        text_l = str(text or "").lower()
        rooms = self.find_rooms_in_text(text)

        start_room = None
        dest_room = None

        # Pattern: from X to Y / من X إلى Y
        patterns = [
            r"(?:from|من)\s+(?:room\s+)?(\d{3}).*?(?:to|إلى|الي|لـ|ل|toward|towards)\s+(?:room\s+)?(\d{3})",
            r"(?:from|من)\s+(?:room\s+)?(\d{3}).*?(\d{3})",
        ]

        for pattern in patterns:
            match = re.search(pattern, text_l)
            if match:
                start_room = int(match.group(1))
                dest_room = int(match.group(2))
                break

        # Heuristic fallback
        if start_room is None and len(rooms) >= 2:
            if "from" in text_l or "من" in text:
                start_room = rooms[0]
                dest_room = rooms[1]
            elif any(w in text_l for w in ["to", "إلى", "الي"]):
                start_room = rooms[0]
                dest_room = rooms[1]
            else:
                dest_room = rooms[-1]
        elif start_room is None and len(rooms) == 1:
            dest_room = rooms[0]

        if dest_room is None:
            dest_room = self.find_room_in_text(text)

        return start_room, dest_room

    def resolve_store_from_category(self, parent_category: str) -> tuple[str, int | None]:
        """Resolve store name and room from parent category."""
        store_name = STORE_CLUSTER.get(parent_category, parent_category)
        room = STORE_CLUSTER_ROOM.get(store_name)
        return store_name, room

    def get_store_cluster_room(self, store_name: str) -> int | None:
        """Get room number for a store cluster name."""
        return STORE_CLUSTER_ROOM.get(store_name)
