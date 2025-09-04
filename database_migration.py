#!/usr/bin/env python3
"""
Database migration script to add missing imported_at columns.
This ensures all deployments have the correct database schema.
"""

import sqlite3
import os
from pathlib import Path

def run_database_migration():
    """Add missing imported_at columns to existing databases."""
    
    # Get database path from environment or use default
    database_url = os.getenv("DATABASE_URL", "sqlite:///./db/viewvault.db")
    
    # Extract file path from SQLAlchemy URL
    if database_url.startswith("sqlite:///"):
        db_path = database_url.replace("sqlite:///", "")
        if db_path.startswith("./"):
            db_path = db_path[2:]  # Remove ./
    else:
        # Fallback to default path
        db_path = "db/viewvault.db"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"Database file {db_path} does not exist, skipping migration")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if imported_at column exists in movie table
        cursor.execute("PRAGMA table_info(movie)")
        movie_columns = [col[1] for col in cursor.fetchall()]
        
        if "imported_at" not in movie_columns:
            cursor.execute("ALTER TABLE movie ADD COLUMN imported_at DATETIME")
            print("Added imported_at column to movie table")
        else:
            print("imported_at column already exists in movie table")
        
        # Check if imported_at column exists in series table
        cursor.execute("PRAGMA table_info(series)")
        series_columns = [col[1] for col in cursor.fetchall()]
        
        if "imported_at" not in series_columns:
            cursor.execute("ALTER TABLE series ADD COLUMN imported_at DATETIME")
            print("Added imported_at column to series table")
        else:
            print("imported_at column already exists in series table")
        
        conn.commit()
        conn.close()
        print("Database migration completed successfully")
        
    except Exception as e:
        print(f"Database migration failed: {e}")
        raise

if __name__ == "__main__":
    run_database_migration()
