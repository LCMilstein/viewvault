#!/usr/bin/env python3
"""
Database migration script to add runtime fields to Movie and Series tables.
This script adds runtime and average_episode_runtime columns to existing tables.
"""

import sqlite3
import os
from pathlib import Path

def migrate_runtime():
    """Add runtime fields to existing database tables."""
    db_path = Path("db/watchlist.db")
    
    if not db_path.exists():
        print("Database file not found. Creating new database...")
        return
    
    print("Starting runtime migration...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if runtime column already exists in Movie table
        cursor.execute("PRAGMA table_info(movie)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'runtime' not in columns:
            print("Adding runtime column to Movie table...")
            cursor.execute("ALTER TABLE movie ADD COLUMN runtime INTEGER")
            print("✓ Added runtime column to Movie table")
        else:
            print("✓ Runtime column already exists in Movie table")
        
        # Check if average_episode_runtime column already exists in Series table
        cursor.execute("PRAGMA table_info(series)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'average_episode_runtime' not in columns:
            print("Adding average_episode_runtime column to Series table...")
            cursor.execute("ALTER TABLE series ADD COLUMN average_episode_runtime INTEGER")
            print("✓ Added average_episode_runtime column to Series table")
        else:
            print("✓ Average episode runtime column already exists in Series table")
        
        conn.commit()
        print("✓ Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_runtime() 