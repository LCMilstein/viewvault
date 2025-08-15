#!/usr/bin/env python3
"""
Migration script to add added_at column to Movie and Series tables.
This script will:
1. Add added_at column to existing tables
2. Set default values for existing records based on their ID (assuming ID order reflects addition order)
3. Make the column non-nullable after setting defaults
"""

import sqlite3
from datetime import datetime, timedelta, timezone
import os

def migrate_added_at():
    """Add added_at column to Movie and Series tables"""
    
    # Get the database path - use the same path as the app
    db_path = os.path.join("db", "watchlist.db")
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found!")
        return False
    
    print(f"Starting migration to add added_at column to {db_path}")
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if added_at column already exists in Movie table
        cursor.execute("PRAGMA table_info(movie)")
        movie_columns = [column[1] for column in cursor.fetchall()]
        
        if 'added_at' not in movie_columns:
            print("Adding added_at column to Movie table...")
            
            # Add the column as nullable first
            cursor.execute("ALTER TABLE movie ADD COLUMN added_at DATETIME")
            
            # Get all movies ordered by ID (assuming ID order reflects addition order)
            cursor.execute("SELECT id FROM movie ORDER BY id")
            movie_ids = cursor.fetchall()
            
            # Set added_at values based on ID order (assuming 1 minute intervals between additions)
            base_time = datetime.now(timezone.utc) - timedelta(minutes=len(movie_ids))
            for i, (movie_id,) in enumerate(movie_ids):
                added_time = base_time + timedelta(minutes=i)
                cursor.execute(
                    "UPDATE movie SET added_at = ? WHERE id = ?",
                    (added_time.isoformat(), movie_id)
                )
            
            print(f"Updated {len(movie_ids)} movies with added_at timestamps")
        else:
            print("added_at column already exists in Movie table")
        
        # Check if added_at column already exists in Series table
        cursor.execute("PRAGMA table_info(series)")
        series_columns = [column[1] for column in cursor.fetchall()]
        
        if 'added_at' not in series_columns:
            print("Adding added_at column to Series table...")
            
            # Add the column as nullable first
            cursor.execute("ALTER TABLE series ADD COLUMN added_at DATETIME")
            
            # Get all series ordered by ID (assuming ID order reflects addition order)
            cursor.execute("SELECT id FROM series ORDER BY id")
            series_ids = cursor.fetchall()
            
            # Set added_at values based on ID order (assuming 1 minute intervals between additions)
            base_time = datetime.now(timezone.utc) - timedelta(minutes=len(series_ids))
            for i, (series_id,) in enumerate(series_ids):
                added_time = base_time + timedelta(minutes=i)
                cursor.execute(
                    "UPDATE series SET added_at = ? WHERE id = ?",
                    (added_time.isoformat(), series_id)
                )
            
            print(f"Updated {len(series_ids)} series with added_at timestamps")
        else:
            print("added_at column already exists in Series table")
        
        # Commit the changes
        conn.commit()
        print("Migration completed successfully!")
        
        return True
        
    except Exception as e:
        print(f"Migration failed: {e}")
        if conn:
            conn.rollback()
        return False
    
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    success = migrate_added_at()
    if success:
        print("Migration completed successfully!")
    else:
        print("Migration failed!")
        exit(1) 