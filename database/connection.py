"""Database connection and initialization."""
import sqlite3
import os
from config import DB_PATH


def get_db_connection():
    """Create and return a database connection."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_database():
    """Initialize database tables."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT,
            age INTEGER,
            gender TEXT,
            lower_budget REAL,
            upper_budget REAL,
            special_needs INTEGER DEFAULT 0
        )
    """)

    # Migrate old database: add special_needs if missing
    try:
        cursor.execute("SELECT special_needs FROM users LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE users ADD COLUMN special_needs INTEGER DEFAULT 0")
        conn.commit()
        print("✅ Migrated database: added special_needs column")

    # User preferences table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            main_category TEXT,
            category TEXT,
            subcategory TEXT,
            FOREIGN KEY(username) REFERENCES users(username)
        )
    """)

    # Navigation history table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            start_point TEXT,
            end_store TEXT
        )
    """)

    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")
