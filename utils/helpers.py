"""General utility functions."""
import json
import os


def load_json_file(path, default=None):
    """Load JSON file with fallback default."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default if default is not None else []


def save_json_file(path, data):
    """Save data to JSON file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def set_session_defaults(session):
    """Set default session values."""
    session = session or {}
    defaults = {
        "username": None,
        "gender": "other",
        "low": 500,
        "high": 5000,
        "is_new": True,
        "start_floor": None,
        "start_xy": None,
        "nav_mode": "Normal",
        "recommended_room": None,
        "nav_target_room": None,
        "last_dest_room": None,
        "last_referenced_room": None,
        "selected_subcategory": None,
        "accepted_store": False,
        "special_needs": False,
        "chat_start_floor": None,
        "chat_start_xy": None,
        "chat_dest_room": None,
    }
    for k, v in defaults.items():
        session.setdefault(k, v)
    return session
