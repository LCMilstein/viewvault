#!/usr/bin/env python3
"""
Script to check runtime data for Entourage and other series
"""

from database import engine
from models import Series
from sqlmodel import Session, select

def check_series_runtimes():
    """Check runtime data for all series, especially Entourage."""
    print("Checking series runtime data...")
    print("=" * 50)
    
    with Session(engine) as session:
        # Get all series
        all_series = session.exec(select(Series)).all()
        
        print(f"Total series in database: {len(all_series)}")
        print()
        
        for series in all_series:
            print(f"Series: {series.title}")
            print(f"  IMDB ID: {series.imdb_id}")
            print(f"  Average Episode Runtime: {series.average_episode_runtime}")
            print(f"  Type: {series.type}")
            print()
            
            # Special focus on Entourage
            if "entourage" in series.title.lower():
                print(f"*** ENTOURAGE DETAILS ***")
                print(f"  Title: {series.title}")
                print(f"  IMDB ID: {series.imdb_id}")
                print(f"  Runtime: {series.average_episode_runtime}")
                print(f"  Type: {series.type}")
                print()

if __name__ == "__main__":
    check_series_runtimes() 