"""Database package for Smart Mall AI."""
from .connection import get_db_connection, init_database
from .operations import (
    save_user, get_user, save_preference, get_last_preference,
    save_navigation_history, get_most_visited_store, user_exists
)

__all__ = [
    "get_db_connection", "init_database", "save_user", "get_user",
    "save_preference", "get_last_preference", "save_navigation_history",
    "get_most_visited_store", "user_exists"
]
