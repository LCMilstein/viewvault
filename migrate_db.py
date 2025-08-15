#!/usr/bin/env python3
"""
Database migration script to add is_new columns to existing tables.
Run this script to update your existing database schema.
"""

import sqlite3
import os

def migrate_database():
    # Get the database path - use the same path as the app
    db_path = os.path.join("db", "watchlist.db")
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found. Creating new database...")
        return
    
    print("Starting database migration...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if is_new column exists in movies table
        cursor.execute("PRAGMA table_info(movie)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_new' not in columns:
            print("Adding is_new column to movie table...")
            cursor.execute("ALTER TABLE movie ADD COLUMN is_new BOOLEAN DEFAULT FALSE")
            print("✓ Added is_new column to movie table")
        else:
            print("✓ is_new column already exists in movie table")
        
        # Check if is_new column exists in series table
        cursor.execute("PRAGMA table_info(series)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'is_new' not in columns:
            print("Adding is_new column to series table...")
            cursor.execute("ALTER TABLE series ADD COLUMN is_new BOOLEAN DEFAULT FALSE")
            print("✓ Added is_new column to series table")
        else:
            print("✓ is_new column already exists in series table")
        
        # Commit changes
        conn.commit()
        print("✓ Database migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database() 