#!/usr/bin/env python3
"""
Migration script to add user_id columns to existing tables.
This script will:
1. Add user_id columns to movie and series tables
2. Create a default user if none exists
3. Associate existing data with the default user
"""

import sqlite3
import hashlib
import os

def hash_password(password: str) -> str:
    """Hash a password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def migrate_database():
    """Run the migration to add user_id columns"""
    db_path = "db/watchlist.db"
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found!")
        return
    
    print("Starting migration to add user_id columns...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if user_id columns already exist
        cursor.execute("PRAGMA table_info(movie)")
        movie_columns = [column[1] for column in cursor.fetchall()]
        
        cursor.execute("PRAGMA table_info(series)")
        series_columns = [column[1] for column in cursor.fetchall()]
        
        needs_migration = False
        if 'user_id' not in movie_columns:
            needs_migration = True
            print("user_id column missing from movie table")
        if 'user_id' not in series_columns:
            needs_migration = True
            print("user_id column missing from series table")
        
        if not needs_migration:
            print("Migration not needed - user_id columns already exist")
            return
        
        print("Adding user_id columns...")
        
        # Add user_id column to movie table
        if 'user_id' not in movie_columns:
            cursor.execute("ALTER TABLE movie ADD COLUMN user_id INTEGER")
            print("Added user_id column to movie table")
        
        # Add user_id column to series table
        if 'user_id' not in series_columns:
            cursor.execute("ALTER TABLE series ADD COLUMN user_id INTEGER")
            print("Added user_id column to series table")
        
        # Check if users table exists, create if not
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user'")
        if not cursor.fetchone():
            print("Creating user table...")
            cursor.execute("""
                CREATE TABLE user (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT,
                    hashed_password TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    is_admin BOOLEAN DEFAULT 0
                )
            """)
            print("Created user table")
        
        # Create default user if none exists
        cursor.execute("SELECT COUNT(*) FROM user")
        user_count = cursor.fetchone()[0]
        
        if user_count == 0:
            print("Creating default user...")
            default_password_hash = hash_password("password")
            cursor.execute("""
                INSERT INTO user (username, email, hashed_password, is_active, is_admin)
                VALUES (?, ?, ?, ?, ?)
            """, ("default", "default@example.com", default_password_hash, True, True))
            default_user_id = cursor.lastrowid
            print(f"Created default user with ID: {default_user_id}")
        else:
            # Get the first user's ID
            cursor.execute("SELECT id FROM user LIMIT 1")
            default_user_id = cursor.fetchone()[0]
            print(f"Using existing user with ID: {default_user_id}")
        
        # Update existing movies to belong to default user
        cursor.execute("UPDATE movie SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
        movie_count = cursor.rowcount
        print(f"Updated {movie_count} movies to belong to user {default_user_id}")
        
        # Update existing series to belong to default user
        cursor.execute("UPDATE series SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
        series_count = cursor.rowcount
        print(f"Updated {series_count} series to belong to user {default_user_id}")
        
        # Commit changes
        conn.commit()
        print("Migration completed successfully!")
        
        # Verify the migration
        cursor.execute("SELECT COUNT(*) FROM movie WHERE user_id IS NULL")
        null_movies = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM series WHERE user_id IS NULL")
        null_series = cursor.fetchone()[0]
        
        print(f"Verification: {null_movies} movies and {null_series} series with NULL user_id")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database() 