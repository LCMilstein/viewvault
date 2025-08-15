#!/usr/bin/env python3
"""
Script to backfill descriptions for existing movies from TMDB.
This will populate the overview field for movies that don't have it.
"""

import sqlite3
import sys
import logging
import time
import os
from pathlib import Path

# Add the current directory to the path so we can import our modules
sys.path.append('.')

from tmdb_service import get_tmdb_movie_by_imdb

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def backfill_movie_descriptions():
    """Backfill descriptions for existing movies from TMDB."""
    db_path = Path("db/watchlist.db")
    
    if not db_path.exists():
        logger.error(f"Database file not found: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all movies without descriptions
        cursor.execute("""
            SELECT id, title, imdb_id, overview 
            FROM movie 
            WHERE overview IS NULL OR overview = ''
        """)
        movies_to_update = cursor.fetchall()
        
        logger.info(f"Found {len(movies_to_update)} movies without descriptions")
        
        if len(movies_to_update) == 0:
            logger.info("✅ All movies already have descriptions!")
            return True
        
        updated_count = 0
        failed_count = 0
        
        for movie_id, title, imdb_id, current_overview in movies_to_update:
            try:
                logger.info(f"Getting description for: {title} ({imdb_id})")
                
                # Get movie details from TMDB
                tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
                
                if tmdb_movie and tmdb_movie.get('overview'):
                    overview = tmdb_movie.get('overview')
                    
                    # Update the movie with the description
                    cursor.execute("""
                        UPDATE movie 
                        SET overview = ? 
                        WHERE id = ?
                    """, (overview, movie_id))
                    
                    updated_count += 1
                    logger.info(f"✅ Updated description for: {title}")
                    
                    # Brief delay to be nice to TMDB API
                    time.sleep(0.25)
                    
                else:
                    logger.warning(f"⚠️ No description found for: {title} ({imdb_id})")
                    failed_count += 1
                    
            except Exception as e:
                logger.error(f"❌ Failed to update {title}: {e}")
                failed_count += 1
        
        # Commit all changes
        conn.commit()
        conn.close()
        
        logger.info(f"🎉 Backfill completed!")
        logger.info(f"✅ Updated: {updated_count} movies")
        logger.info(f"❌ Failed: {failed_count} movies")
        
        return True
        
    except Exception as e:
        logger.error(f"Database error during backfill: {e}")
        return False

if __name__ == "__main__":
    logger.info("🔄 Starting description backfill for existing movies...")
    
    # Check if TMDB API key is available
    if not os.environ.get("TMDB_API_KEY"):
        logger.error("❌ TMDB_API_KEY environment variable not found!")
        logger.error("Make sure to set TMDB_API_KEY before running this script")
        sys.exit(1)
    
    success = backfill_movie_descriptions()
    
    if success:
        logger.info("✅ Description backfill completed successfully! 🎉")
        logger.info("🚀 Existing movies should now show descriptions in the UI")
        sys.exit(0)
    else:
        logger.error("❌ Description backfill failed!")
        sys.exit(1)
