#!/usr/bin/env python3
"""
Debug script to check added_at values in the database.
This will help diagnose why "Sort by Added (newest first)" isn't working properly.
"""

import sqlite3
import os
from datetime import datetime

def debug_added_at():
    """Check added_at values in the database"""
    
    # Get the database path
    db_path = os.path.join("db", "watchlist.db")
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found!")
        return False
    
    print(f"Checking added_at values in {db_path}")
    print("=" * 60)
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check Movie table
        print("\n📽️ MOVIE TABLE:")
        print("-" * 40)
        
        # Check if added_at column exists
        cursor.execute("PRAGMA table_info(movie)")
        movie_columns = [column[1] for column in cursor.fetchall()]
        
        if 'added_at' in movie_columns:
            print("✅ added_at column exists")
            
            # Get sample of movies with added_at values
            cursor.execute("""
                SELECT id, title, added_at, user_id 
                FROM movie 
                ORDER BY added_at DESC 
                LIMIT 10
            """)
            movies = cursor.fetchall()
            
            print(f"\nTop 10 movies by added_at (newest first):")
            for movie in movies:
                movie_id, title, added_at, user_id = movie
                print(f"  ID: {movie_id}, Title: {title[:40]}, Added: {added_at}, User: {user_id}")
            
            # Check for movies without added_at
            cursor.execute("SELECT COUNT(*) FROM movie WHERE added_at IS NULL")
            null_count = cursor.fetchone()[0]
            print(f"\nMovies without added_at: {null_count}")
            
            if null_count > 0:
                cursor.execute("SELECT id, title FROM movie WHERE added_at IS NULL LIMIT 5")
                null_movies = cursor.fetchall()
                print("Sample movies without added_at:")
                for movie in null_movies:
                    print(f"  ID: {movie[0]}, Title: {movie[1][:40]}")
        else:
            print("❌ added_at column does not exist!")
        
        # Check Series table
        print("\n📺 SERIES TABLE:")
        print("-" * 40)
        
        cursor.execute("PRAGMA table_info(series)")
        series_columns = [column[1] for column in cursor.fetchall()]
        
        if 'added_at' in series_columns:
            print("✅ added_at column exists")
            
            # Get sample of series with added_at values
            cursor.execute("""
                SELECT id, title, added_at, user_id 
                FROM series 
                ORDER BY added_at DESC 
                LIMIT 10
            """)
            series_list = cursor.fetchall()
            
            print(f"\nTop 10 series by added_at (newest first):")
            for series in series_list:
                series_id, title, added_at, user_id = series
                print(f"  ID: {series_id}, Title: {title[:40]}, Added: {added_at}, User: {user_id}")
            
            # Check for series without added_at
            cursor.execute("SELECT COUNT(*) FROM series WHERE added_at IS NULL")
            null_count = cursor.fetchone()[0]
            print(f"\nSeries without added_at: {null_count}")
            
            if null_count > 0:
                cursor.execute("SELECT id, title FROM series WHERE added_at IS NULL LIMIT 5")
                null_series = cursor.fetchall()
                print("Sample series without added_at:")
                for series in null_series:
                    print(f"  ID: {series[0]}, Title: {series[1][:40]}")
        else:
            print("❌ added_at column does not exist!")
        
        # Check total counts
        print("\n📊 SUMMARY:")
        print("-" * 40)
        cursor.execute("SELECT COUNT(*) FROM movie")
        movie_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM series")
        series_count = cursor.fetchone()[0]
        
        print(f"Total movies: {movie_count}")
        print(f"Total series: {series_count}")
        
        # Check recent additions (last 24 hours)
        print("\n🕐 RECENT ADDITIONS (last 24 hours):")
        print("-" * 40)
        
        # Get current time and 24 hours ago
        now = datetime.now()
        yesterday = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Check movies added today
        cursor.execute("""
            SELECT id, title, added_at 
            FROM movie 
            WHERE added_at >= ? 
            ORDER BY added_at DESC
        """, (yesterday.isoformat(),))
        recent_movies = cursor.fetchall()
        
        print(f"Movies added today: {len(recent_movies)}")
        for movie in recent_movies:
            movie_id, title, added_at = movie
            print(f"  ID: {movie_id}, Title: {title[:40]}, Added: {added_at}")
        
        # Check series added today
        cursor.execute("""
            SELECT id, title, added_at 
            FROM series 
            WHERE added_at >= ? 
            ORDER BY added_at DESC
        """, (yesterday.isoformat(),))
        recent_series = cursor.fetchall()
        
        print(f"\nSeries added today: {len(recent_series)}")
        for series in recent_series:
            series_id, title, added_at = series
            print(f"  ID: {series_id}, Title: {title[:40]}, Added: {added_at}")
        
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        return False
    
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    debug_added_at() 