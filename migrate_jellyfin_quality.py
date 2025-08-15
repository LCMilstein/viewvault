#!/usr/bin/env python3
"""
Database migration script to add quality column for Jellyfin integration
"""

import sqlite3
import os

def migrate_database():
    # Get the database path - use the same path as the app
    db_path = os.path.join("db", "watchlist.db")
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found.")
        return
    
    print("Starting Jellyfin quality migration...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if quality column already exists
        cursor.execute("PRAGMA table_info(movie)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'quality' not in columns:
            print("Adding quality column to movie table...")
            cursor.execute("ALTER TABLE movie ADD COLUMN quality TEXT")
            print("✅ Quality column added successfully")
        else:
            print("✅ Quality column already exists")
        
        conn.commit()
        print("Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database() 