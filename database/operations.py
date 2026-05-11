"""Database CRUD operations."""
import sqlite3
from .connection import get_db_connection


def user_exists(username: str) -> bool:
    """Check if a user exists in the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT username FROM users WHERE username=?", (username,))
    result = cursor.fetchone()
    conn.close()
    return result is not None


def save_user(username, password, name, age, gender, lower_budget, upper_budget, special_needs=False):
    """Save a new user to the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    special_flag = 1 if special_needs else 0
    cursor.execute(
        "INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (username, password, name, int(age), gender, lower_budget, upper_budget, special_flag),
    )
    conn.commit()
    conn.close()


def get_user(username, password):
    """Authenticate and retrieve user data."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM users WHERE username=? AND password=?",
        (username, password)
    )
    user = cursor.fetchone()
    conn.close()
    return user


def save_preference(username, preference):
    """Save user preference (main_category, category, subcategory)."""
    if not preference or len(preference) != 3:
        return
    main, cat, sub = preference
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO user_preferences (username, main_category, category, subcategory)
           VALUES (?, ?, ?, ?)""",
        (username, main, cat, sub),
    )
    conn.commit()
    conn.close()


def get_last_preference(username):
    """Get the most recent user preference."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT main_category, category, subcategory
           FROM user_preferences
           WHERE username=?
           ORDER BY id DESC LIMIT 1""",
        (username,),
    )
    result = cursor.fetchone()
    conn.close()
    return result


def save_navigation_history(username, start_point, end_store):
    """Save navigation history entry."""
    if isinstance(start_point, tuple):
        start_point = f"{start_point[0]},{start_point[1]}"
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO history (username, start_point, end_store) VALUES (?, ?, ?)",
        (username, start_point, str(end_store)),
    )
    conn.commit()
    conn.close()


def get_most_visited_store(username):
    """Get the most frequently visited store for a user."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT end_store, COUNT(*) as cnt
           FROM history
           WHERE username=?
           GROUP BY end_store
           ORDER BY cnt DESC""",
        (username,),
    )
    result = cursor.fetchone()
    conn.close()
    return int(result[0]) if result else None
