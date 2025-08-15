#!/usr/bin/env python3
"""
Script to update runtime data for existing movies and series in the database.
This script fetches runtime information from TMDB for items that don't have it.
"""

import os
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from secrets.env
load_dotenv('secrets.env')

# Add the current directory to Python path so we can import our modules
sys.path.append(str(Path(__file__).parent))

from sqlmodel import Session, select
from models import Movie, Series
from database import engine
from tmdb_service import movie_api, tv_api, find_api

def update_movie_runtimes():
    """Update runtime data for movies that don't have it."""
    print("Updating movie runtime data...")
    
    with Session(engine) as session:
        # Get movies without runtime data
        movies_without_runtime = session.exec(
            select(Movie).where(Movie.runtime.is_(None))
        ).all()
        
        print(f"Found {len(movies_without_runtime)} movies without runtime data")
        
        updated_count = 0
        error_count = 0
        
        for i, movie in enumerate(movies_without_runtime, 1):
            try:
                print(f"[{i}/{len(movies_without_runtime)}] Updating runtime for: {movie.title} (IMDB: {movie.imdb_id})")
                
                # Get movie details from TMDB
                if movie.imdb_id.startswith('tt'):
                    # Try to find TMDB ID using IMDB ID
                    try:
                        find_result = find_api.find(movie.imdb_id, external_source='imdb_id')
                        if find_result and 'movie_results' in find_result and find_result['movie_results']:
                            tmdb_id = find_result['movie_results'][0]['id']
                            movie_details = movie_api.details(tmdb_id)
                            runtime = getattr(movie_details, 'runtime', None)
                            
                            if runtime:
                                movie.runtime = runtime
                                session.add(movie)
                                updated_count += 1
                                print(f"  ✓ Updated runtime: {runtime} minutes")
                            else:
                                print(f"  ✗ No runtime data available")
                        else:
                            print(f"  ✗ Movie not found on TMDB")
                    except Exception as e:
                        print(f"  ✗ Error fetching from TMDB: {e}")
                        error_count += 1
                else:
                    print(f"  ✗ Skipping - not a valid IMDB ID")
                    
                # Commit every 10 movies to avoid memory issues
                if i % 10 == 0:
                    session.commit()
                    print(f"  [Progress: {i}/{len(movies_without_runtime)} - Updated: {updated_count}, Errors: {error_count}]")
                    time.sleep(1)  # Small delay to avoid rate limiting
                    
            except Exception as e:
                print(f"  ✗ Error processing {movie.title}: {e}")
                error_count += 1
        
        session.commit()
        print(f"✓ Updated runtime for {updated_count} movies (Errors: {error_count})")

def update_series_runtimes():
    """Update runtime data for series that don't have it."""
    print("Updating series runtime data...")
    
    with Session(engine) as session:
        # Get series without runtime data
        series_without_runtime = session.exec(
            select(Series).where(Series.average_episode_runtime.is_(None))
        ).all()
        
        print(f"Found {len(series_without_runtime)} series without runtime data")
        
        updated_count = 0
        error_count = 0
        
        for i, series in enumerate(series_without_runtime, 1):
            try:
                print(f"[{i}/{len(series_without_runtime)}] Updating runtime for: {series.title} (IMDB: {series.imdb_id})")
                
                # Handle both IMDB IDs and TMDB IDs
                if series.imdb_id.startswith('tt'):
                    # Try to find TMDB ID using IMDB ID
                    try:
                        find_result = find_api.find(series.imdb_id, external_source='imdb_id')
                        if find_result and 'tv_results' in find_result and find_result['tv_results']:
                            tmdb_id = find_result['tv_results'][0]['id']
                            series_details = tv_api.details(tmdb_id)
                            episode_runtime = getattr(series_details, 'episode_run_time', None)
                            
                            if episode_runtime and len(episode_runtime) > 0:
                                runtime = episode_runtime[0]  # Use first episode runtime
                                series.average_episode_runtime = runtime
                                session.add(series)
                                updated_count += 1
                                print(f"  ✓ Updated runtime: {runtime} minutes")
                            else:
                                print(f"  ✗ No runtime data available")
                        else:
                            print(f"  ✗ Series not found on TMDB")
                    except Exception as e:
                        print(f"  ✗ Error fetching from TMDB: {e}")
                        error_count += 1
                elif series.imdb_id.startswith('tmdb_'):
                    # Direct TMDB ID
                    try:
                        tmdb_id = int(series.imdb_id.replace('tmdb_', ''))
                        series_details = tv_api.details(tmdb_id)
                        episode_runtime = getattr(series_details, 'episode_run_time', None)
                        
                        if episode_runtime and len(episode_runtime) > 0:
                            runtime = episode_runtime[0]  # Use first episode runtime
                            series.average_episode_runtime = runtime
                            session.add(series)
                            updated_count += 1
                            print(f"  ✓ Updated runtime: {runtime} minutes")
                        else:
                            print(f"  ✗ No runtime data available")
                    except Exception as e:
                        print(f"  ✗ Error fetching from TMDB: {e}")
                        error_count += 1
                else:
                    print(f"  ✗ Skipping - not a valid IMDB or TMDB ID")
                    
                # Commit every 5 series to avoid memory issues
                if i % 5 == 0:
                    session.commit()
                    print(f"  [Progress: {i}/{len(series_without_runtime)} - Updated: {updated_count}, Errors: {error_count}]")
                    time.sleep(1)  # Small delay to avoid rate limiting
                    
            except Exception as e:
                print(f"  ✗ Error processing {series.title}: {e}")
                error_count += 1
        
        session.commit()
        print(f"✓ Updated runtime for {updated_count} series (Errors: {error_count})")

def main():
    """Main function to update runtime data."""
    print("Starting runtime data update...")
    print("=" * 50)
    
    try:
        # Update movie runtimes
        update_movie_runtimes()
        print()
        
        # Update series runtimes
        update_series_runtimes()
        print()
        
        print("Runtime data update completed!")
        
    except KeyboardInterrupt:
        print("\nScript interrupted by user. Progress has been saved.")
    except Exception as e:
        print(f"\nScript failed with error: {e}")
        print("Progress has been saved up to the last commit.")

if __name__ == "__main__":
    main() 