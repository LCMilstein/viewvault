#!/usr/bin/env python3
"""
Debug script to check for orphaned movies in the database.
This will help identify movies that exist but aren't properly linked to lists.
"""

import sqlite3
import sys
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_orphaned_movies():
    """Check for movies that exist but aren't linked to any list."""
    db_path = Path("db/watchlist.db")
    
    if not db_path.exists():
        logger.error(f"Database file not found: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if list_item table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='list_item'")
        list_item_exists = cursor.fetchone() is not None
        
        if not list_item_exists:
            logger.warning("list_item table does not exist - this is a newer feature")
            return True
        
        # Get all movies for the current user (assuming user_id = 1 for now)
        cursor.execute("""
            SELECT id, title, imdb_id, user_id 
            FROM movie 
            WHERE deleted = 0 OR deleted IS NULL
        """)
        movies = cursor.fetchall()
        
        logger.info(f"Found {len(movies)} movies in database")
        
        # Check which movies are linked to lists
        orphaned_movies = []
        linked_movies = []
        
        for movie_id, title, imdb_id, user_id in movies:
            # Check if this movie is linked to any list
            cursor.execute("""
                SELECT list_id, item_type 
                FROM list_item 
                WHERE item_id = ? AND item_type = 'movie' AND (deleted = 0 OR deleted IS NULL)
            """, (movie_id,))
            
            list_links = cursor.fetchall()
            
            if list_links:
                linked_movies.append({
                    'id': movie_id,
                    'title': title,
                    'imdb_id': imdb_id,
                    'lists': [link[0] for link in list_links]
                })
                logger.info(f"✅ {title} ({imdb_id}) linked to lists: {[link[0] for link in list_links]}")
            else:
                orphaned_movies.append({
                    'id': movie_id,
                    'title': title,
                    'imdb_id': imdb_id,
                    'user_id': user_id
                })
                logger.warning(f"⚠️ {title} ({imdb_id}) - ORPHANED (not linked to any list)")
        
        # Summary
        logger.info(f"\n📊 SUMMARY:")
        logger.info(f"Total movies: {len(movies)}")
        logger.info(f"Linked movies: {len(linked_movies)}")
        logger.info(f"Orphaned movies: {len(orphaned_movies)}")
        
        if orphaned_movies:
            logger.info(f"\n🔍 ORPHANED MOVIES:")
            for movie in orphaned_movies:
                logger.info(f"  - {movie['title']} (ID: {movie['id']}, IMDB: {movie['imdb_id']})")
        
        conn.close()
        return True
        
    except Exception as e:
        logger.error(f"Error checking database: {e}")
        return False

if __name__ == "__main__":
    logger.info("🔍 Checking for orphaned movies in database...")
    success = check_orphaned_movies()
    
    if success:
        logger.info("✅ Database check completed!")
    else:
        logger.error("❌ Database check failed!")
        sys.exit(1)
