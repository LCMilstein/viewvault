#!/usr/bin/env python3
"""
Fix Missing Poster Art Script
This script identifies and fixes missing poster art by fetching from TMDB
"""

import sqlite3
import requests
import os
from pathlib import Path
import time

# TMDB configuration
TMDB_API_KEY = os.getenv('TMDB_API_KEY')
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"
TMDB_SEARCH_BASE = "https://api.themoviedb.org/3"

def save_poster_image(poster_url, imdb_id, media_type="movie"):
    """Save poster image to static directory"""
    try:
        # Create static directory if it doesn't exist
        static_dir = Path("static/posters")
        static_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        filename = f"{imdb_id}_{media_type}.jpg"
        filepath = static_dir / filename
        
        # Download and save image
        response = requests.get(poster_url, timeout=10)
        response.raise_for_status()
        
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        # Return relative path for database
        return f"/static/posters/{filename}"
    
    except Exception as e:
        print(f"Error saving poster for {imdb_id}: {e}")
        return None

def get_tmdb_poster_url(imdb_id, media_type="movie"):
    """Get poster URL from TMDB using IMDB ID"""
    if not TMDB_API_KEY:
        print("TMDB_API_KEY environment variable not set")
        return None
    
    try:
        # Search by IMDB ID
        search_url = f"{TMDB_SEARCH_BASE}/find/{imdb_id}"
        params = {
            'api_key': TMDB_API_KEY,
            'external_source': 'imdb_id'
        }
        
        response = requests.get(search_url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if media_type == "movie" and data.get('movie_results'):
            movie = data['movie_results'][0]
            if movie.get('poster_path'):
                return f"{TMDB_IMAGE_BASE}{movie['poster_path']}"
        
        elif media_type == "tv" and data.get('tv_results'):
            tv = data['tv_results'][0]
            if tv.get('poster_path'):
                return f"{TMDB_IMAGE_BASE}{tv['poster_path']}"
        
        return None
    
    except Exception as e:
        print(f"Error fetching TMDB data for {imdb_id}: {e}")
        return None

def fix_missing_posters(db_path):
    """Fix missing poster art in the database"""
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Checking database: {db_path}")
    
    # Check movies missing posters
    cursor.execute("""
        SELECT id, title, imdb_id, poster_url 
        FROM movie 
        WHERE poster_url IS NULL OR poster_url = '' OR poster_url = '/static/no-image.png'
    """)
    movies_no_poster = cursor.fetchall()
    
    print(f"Found {len(movies_no_poster)} movies missing posters")
    
    for movie_id, title, imdb_id, current_poster in movies_no_poster:
        if not imdb_id:
            print(f"  Skipping {title} - no IMDB ID")
            continue
            
        print(f"  Fixing poster for: {title} (IMDB: {imdb_id})")
        
        # Get poster from TMDB
        poster_url = get_tmdb_poster_url(imdb_id, "movie")
        
        if poster_url:
            # Save poster locally
            local_path = save_poster_image(poster_url, imdb_id, "movie")
            
            if local_path:
                # Update database
                cursor.execute("""
                    UPDATE movie 
                    SET poster_url = ? 
                    WHERE id = ?
                """, (local_path, movie_id))
                
                print(f"    ✓ Poster saved: {local_path}")
            else:
                print(f"    ✗ Failed to save poster")
        else:
            print(f"    ✗ No poster found on TMDB")
        
        # Rate limiting
        time.sleep(0.1)
    
    # Check series missing posters
    cursor.execute("""
        SELECT id, title, imdb_id, poster_url 
        FROM series 
        WHERE poster_url IS NULL OR poster_url = '' OR poster_url = '/static/no-image.png'
    """)
    series_no_poster = cursor.fetchall()
    
    print(f"\nFound {len(series_no_poster)} series missing posters")
    
    for series_id, title, imdb_id, current_poster in series_no_poster:
        if not imdb_id:
            print(f"  Skipping {title} - no IMDB ID")
            continue
            
        print(f"  Fixing poster for: {title} (IMDB: {imdb_id})")
        
        # Get poster from TMDB
        poster_url = get_tmdb_poster_url(imdb_id, "tv")
        
        if poster_url:
            # Save poster locally
            local_path = save_poster_image(poster_url, imdb_id, "tv")
            
            if local_path:
                # Update database
                cursor.execute("""
                    UPDATE series 
                    SET poster_url = ? 
                    WHERE id = ?
                """, (local_path, series_id))
                
                print(f"    ✓ Poster saved: {local_path}")
            else:
                print(f"    ✗ Failed to save poster")
        else:
            print(f"    ✗ No poster found on TMDB")
        
        # Rate limiting
        time.sleep(0.1)
    
    # Commit changes
    conn.commit()
    conn.close()
    
    print(f"\nPoster fix completed!")

if __name__ == "__main__":
    # Check both possible database locations
    databases = ["db/watchlist.db", "watchlist.db"]
    
    for db_path in databases:
        if Path(db_path).exists():
            print(f"\n{'='*50}")
            fix_missing_posters(db_path)
            break
    else:
        print("No database found. Please check the database path.") 