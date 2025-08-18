#!/usr/bin/env python3
"""
Remote Database Migration Script
This script fixes the database schema on the remote server by adding missing user_id columns.

Run this script on the remote server where wlapp.umpyours.com is hosted.
"""

import sqlite3
import os
import sys
from pathlib import Path

def get_database_path():
    """Get the database path - adjust this based on your server setup"""
    # Common locations - adjust as needed
    possible_paths = [
        "watchlist.db",
        "db/watchlist.db", 
        "/app/watchlist.db",
        "/app/db/watchlist.db",
        "/var/www/watchlist.db",
        "/var/www/db/watchlist.db"
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            print(f"Found database at: {path}")
            return path
    
    print("ERROR: Could not find watchlist.db")
    print("Please update the possible_paths list in this script")
    return None

def check_schema(db_path):
    """Check current database schema"""
    print(f"\n🔍 Checking current schema for: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check movie table schema
    cursor.execute("PRAGMA table_info(movie)")
    movie_columns = cursor.fetchall()
    print(f"\n📽️ Movie table columns:")
    for col in movie_columns:
        print(f"  - {col[1]} ({col[2]})")
    
    # Check series table schema  
    cursor.execute("PRAGMA table_info(series)")
    series_columns = cursor.fetchall()
    print(f"\n📺 Series table columns:")
    for col in series_columns:
        print(f"  - {col[1]} ({col[2]})")
    
    # Check if user_id columns exist
    movie_has_user_id = any(col[1] == 'user_id' for col in movie_columns)
    series_has_user_id = any(col[1] == 'user_id' for col in series_columns)
    
    conn.close()
    
    return movie_has_user_id, series_has_user_id

def fix_schema(db_path):
    """Fix the database schema by adding missing user_id columns"""
    print(f"\n🔧 Fixing schema for: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if user_id column exists in movie table
        cursor.execute("PRAGMA table_info(movie)")
        movie_columns = cursor.fetchall()
        movie_has_user_id = any(col[1] == 'user_id' for col in movie_columns)
        
        if not movie_has_user_id:
            print("  ➕ Adding user_id column to movie table...")
            cursor.execute("ALTER TABLE movie ADD COLUMN user_id INTEGER")
            print("  ✅ user_id column added to movie table")
        else:
            print("  ✅ user_id column already exists in movie table")
        
        # Check if user_id column exists in series table
        cursor.execute("PRAGMA table_info(series)")
        series_columns = cursor.fetchall()
        series_has_user_id = any(col[1] == 'user_id' for col in series_columns)
        
        if not series_has_user_id:
            print("  ➕ Adding user_id column to series table...")
            cursor.execute("ALTER TABLE series ADD COLUMN user_id INTEGER")
            print("  ✅ user_id column added to series table")
        else:
            print("  ✅ user_id column already exists in series table")
        
        # Commit changes
        conn.commit()
        print("\n✅ Schema fix completed successfully!")
        
        # Show updated schema
        print("\n📋 Updated schema:")
        check_schema(db_path)
        
    except Exception as e:
        print(f"❌ Error fixing schema: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()
    
    return True

def check_movie_data(db_path):
    """Check if 'The Good Son' exists and has user_id"""
    print(f"\n🔍 Checking movie data...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Look for "The Good Son"
        cursor.execute("SELECT id, title, imdb_id, user_id FROM movie WHERE title LIKE '%Good Son%' OR title LIKE '%Good%Son%'")
        movies = cursor.fetchall()
        
        if movies:
            print(f"  📽️ Found {len(movies)} movie(s) matching 'The Good Son':")
            for movie in movies:
                print(f"    ID: {movie[0]}, Title: {movie[1]}, IMDB: {movie[2]}, User ID: {movie[3]}")
        else:
            print("  ❌ No movies found matching 'The Good Son'")
        
        # Check total movie count
        cursor.execute("SELECT COUNT(*) FROM movie")
        total_movies = cursor.fetchone()[0]
        print(f"  📊 Total movies in database: {total_movies}")
        
        # Check movies with null user_id
        cursor.execute("SELECT COUNT(*) FROM movie WHERE user_id IS NULL")
        null_user_movies = cursor.fetchone()[0]
        print(f"  ⚠️  Movies with null user_id: {null_user_movies}")
        
    except Exception as e:
        print(f"❌ Error checking movie data: {e}")
    finally:
        conn.close()

def main():
    print("🚀 Remote Database Migration Script")
    print("=" * 50)
    
    # Get database path
    db_path = get_database_path()
    if not db_path:
        sys.exit(1)
    
    # Check current schema
    movie_has_user_id, series_has_user_id = check_schema(db_path)
    
    if movie_has_user_id and series_has_user_id:
        print("\n✅ Database schema is already correct!")
        print("No migration needed.")
    else:
        print("\n⚠️  Database schema needs fixing!")
        print("Missing user_id columns detected.")
        
        # Ask for confirmation
        response = input("\nDo you want to fix the schema? (y/N): ")
        if response.lower() in ['y', 'yes']:
            if fix_schema(db_path):
                check_movie_data(db_path)
            else:
                print("❌ Schema fix failed!")
        else:
            print("❌ Migration cancelled.")
    
    print("\n🏁 Migration script completed.")

if __name__ == "__main__":
    main()
