"""Smart Mall AI - Professional Indoor Navigation System

A modular Python application for shopping mall navigation,
store recommendations, and AI assistance.

Usage:
    from smart_mall import create_app
    app = create_app()
    app.launch()
"""

__version__ = "1.0.0"
__author__ = "Smart Mall AI Team"

# Make key imports available at package level
from ui import create_app
from database import init_database
from config import (
    ROOM_INFO, STORE_CLUSTER, STORE_ALIASES,
    DEFAULT_LOW_BUDGET, DEFAULT_HIGH_BUDGET
)

__all__ = [
    "create_app",
    "init_database",
    "ROOM_INFO",
    "STORE_CLUSTER",
    "STORE_ALIASES",
    "DEFAULT_LOW_BUDGET",
    "DEFAULT_HIGH_BUDGET",
]
