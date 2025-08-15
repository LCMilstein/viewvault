#!/usr/bin/env python3
"""
Script to manually fix Entourage's runtime data
"""

from database import engine
from models import Series
from sqlmodel import Session, select
import tmdb_service

def fix_entourage_runtime():
    """Manually fix Entourage's runtime data."""
    print("Fixing Entourage runtime data...")
    print("=" * 50)
    
    with Session(engine) as session:
        # Find Entourage
        entourage = session.exec(select(Series).where(Series.title.ilike("%entourage%"))).first()
        
        if not entourage:
            print("Entourage not found in database")
            return
            
        print(f"Found Entourage: {entourage.title}")
        print(f"Current IMDB ID: {entourage.imdb_id}")
        print(f"Current Runtime: {entourage.average_episode_runtime}")
        
        # Try to get runtime from TMDB
        try:
            if entourage.imdb_id.startswith('tmdb_'):
                tmdb_id = int(entourage.imdb_id.replace('tmdb_', ''))
                print(f"Fetching from TMDB ID: {tmdb_id}")
                
                # Use tmdb_service to get series details
                series_details = tmdb_service.tv_api.details(tmdb_id)
                episode_runtime = getattr(series_details, 'episode_run_time', None)
                
                if episode_runtime and len(episode_runtime) > 0:
                    runtime = episode_runtime[0]
                    print(f"Found runtime: {runtime} minutes")
                    
                    # Update the database
                    entourage.average_episode_runtime = runtime
                    session.add(entourage)
                    session.commit()
                    
                    print(f"✓ Updated Entourage runtime to {runtime} minutes")
                else:
                    print("✗ No runtime data available from TMDB")
                    
            else:
                print(f"✗ Unexpected IMDB ID format: {entourage.imdb_id}")
                
        except Exception as e:
            print(f"✗ Error fetching from TMDB: {e}")

if __name__ == "__main__":
    fix_entourage_runtime() 