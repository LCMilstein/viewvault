#!/usr/bin/env python3
"""
Database rollback script to remove is_new columns if needed.
Only use this if the migration causes issues.
"""

import sqlite3
import os

def rollback_database():
    # Get the database path - use the same path as the app
    db_path = os.path.join("db", "watchlist.db")
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found.")
        return
    
    print("Starting database rollback...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # SQLite doesn't support DROP COLUMN directly, so we need to recreate tables
        print("⚠️  Warning: This will recreate tables without is_new columns")
        print("⚠️  This will preserve your data but remove the is_new functionality")
        
        # For now, just show what would be done
        print("Rollback would require recreating tables without is_new columns")
        print("This is a destructive operation and should only be used if absolutely necessary")
        
    except Exception as e:
        print(f"❌ Error during rollback: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    rollback_database() 