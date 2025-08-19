#!/usr/bin/env python3
"""
Release Checker Script
Checks for new releases of movies and TV episodes in the watchlist.
This script can be run manually or scheduled via cron.
"""

import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from sqlmodel import Session, select
from models import Series, Episode, Movie
from database import engine
from tmdb_service import get_tv_details_with_imdb, get_tmdb_movie_by_imdb
from imdb_service import IMDBService, MockIMDBService
from jellyfin_service import create_jellyfin_service
import requests
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('release_checker.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Initialize IMDB service
imdb_api_key = os.getenv("IMDB_API_KEY")
if imdb_api_key:
    imdb_service = IMDBService(imdb_api_key)
else:
    imdb_service = MockIMDBService()

class ReleaseChecker:
    def __init__(self):
        self.new_releases = {
            'movies': [],
            'episodes': []
        }
    
    def check_series_for_new_episodes(self) -> List[Dict[str, Any]]:
        """Check all series in the database for new episodes."""
        logger.info("Checking for new TV episodes...")
        new_episodes = []
        
        with Session(engine) as session:
            # Get all series
            series_list = session.exec(select(Series)).all()
            
            for series in series_list:
                try:
                    logger.info(f"Checking series: {series.title} ({series.imdb_id})")
                    
                    # Get current episodes from database
                    current_episodes = session.exec(
                        select(Episode).where(Episode.series_id == series.id)
                    ).all()
                    current_episode_codes = {ep.code for ep in current_episodes}
                    
                    # Get latest episodes from TMDB
                    tmdb_series = get_tv_details_with_imdb(series.imdb_id)
                    if not tmdb_series:
                        logger.warning(f"Could not fetch TMDB data for {series.title}")
                        continue
                    
                    # Check for new episodes
                    for season in tmdb_series.get('seasons', []):
                        for episode in season.get('episodes', []):
                            episode_code = f"S{episode['season_number']:02d}E{episode['episode_number']:02d}"
                            
                            if episode_code not in current_episode_codes:
                                # New episode found
                                new_episode = {
                                    'series_id': series.id,
                                    'series_title': series.title,
                                    'season': episode['season_number'],
                                    'episode': episode['episode_number'],
                                    'title': episode['name'],
                                    'code': episode_code,
                                    'air_date': episode.get('air_date'),
                                    'episode_data': episode
                                }
                                new_episodes.append(new_episode)
                                logger.info(f"New episode found: {series.title} {episode_code} - {episode['name']}")
                    
                except Exception as e:
                    logger.error(f"Error checking series {series.title}: {str(e)}")
                    continue
        
        return new_episodes
    
    def check_movies_for_new_releases(self) -> List[Dict[str, Any]]:
        """Check all movies in the database for new releases/updates."""
        logger.info("Checking for new movie releases...")
        new_movies = []
        
        with Session(engine) as session:
            # Get all movies
            movies = session.exec(select(Movie)).all()
            
            for movie in movies:
                try:
                    logger.info(f"Checking movie: {movie.title} ({movie.imdb_id})")
                    
                    # Get latest movie data from TMDB
                    tmdb_movie = get_tmdb_movie_by_imdb(movie.imdb_id)
                    if not tmdb_movie:
                        logger.warning(f"Could not fetch TMDB data for {movie.title}")
                        continue
                    
                    # Check if there are new releases in the same collection
                    if movie.collection_id:
                        collection_movies = get_collection_movies_by_imdb(movie.imdb_id)
                        if collection_movies:
                            for collection_movie in collection_movies:
                                # Check if this movie is already in our database
                                existing_movie = session.exec(
                                    select(Movie).where(Movie.imdb_id == collection_movie['imdb_id'])
                                ).first()
                                
                                if not existing_movie:
                                    # New movie in collection
                                    new_movie = {
                                        'title': collection_movie['title'],
                                        'imdb_id': collection_movie['imdb_id'],
                                        'release_date': collection_movie.get('release_date'),
                                        'collection_id': movie.collection_id,
                                        'collection_name': movie.collection_name,
                                        'poster_url': collection_movie.get('poster_path'),
                                        'movie_data': collection_movie
                                    }
                                    new_movies.append(new_movie)
                                    logger.info(f"New movie in collection: {collection_movie['title']}")
                    
                except Exception as e:
                    logger.error(f"Error checking movie {movie.title}: {str(e)}")
                    continue
        
        return new_movies
    
    def add_new_episodes_to_database(self, new_episodes: List[Dict[str, Any]]) -> None:
        """Add new episodes to the database."""
        logger.info(f"Adding {len(new_episodes)} new episodes to database...")
        
        with Session(engine) as session:
            for episode_data in new_episodes:
                try:
                    # Create new episode
                    new_episode = Episode(
                        series_id=episode_data['series_id'],
                        season=episode_data['season'],
                        episode=episode_data['episode'],
                        title=episode_data['title'],
                        code=episode_data['code'],
                        air_date=episode_data['air_date']
                    )
                    
                    session.add(new_episode)
                    logger.info(f"Added episode: {episode_data['series_title']} {episode_data['code']}")
                    
                except Exception as e:
                    logger.error(f"Error adding episode {episode_data['code']}: {str(e)}")
                    continue
            
            session.commit()
    
    def add_new_movies_to_database(self, new_movies: List[Dict[str, Any]]) -> None:
        """Add new movies to the database."""
        logger.info(f"Adding {len(new_movies)} new movies to database...")
        
        with Session(engine) as session:
            for movie_data in new_movies:
                try:
                    # Create new movie
                    new_movie = Movie(
                        title=movie_data['title'],
                        imdb_id=movie_data['imdb_id'],
                        release_date=movie_data['release_date'],
                        collection_id=movie_data['collection_id'],
                        collection_name=movie_data['collection_name'],
                        poster_url=movie_data['poster_url'],
                        is_new=True  # Mark as new for notifications
                    )
                    
                    session.add(new_movie)
                    logger.info(f"Added movie: {movie_data['title']}")
                    
                except Exception as e:
                    logger.error(f"Error adding movie {movie_data['title']}: {str(e)}")
                    continue
            
            session.commit()
    
    def mark_series_as_new(self, series_ids: List[int]) -> None:
        """Mark series as having new content."""
        with Session(engine) as session:
            for series_id in series_ids:
                series = session.get(Series, series_id)
                if series:
                    series.is_new = True
            session.commit()
    
    def save_poster_image(self, poster_url: str, imdb_id: str) -> str:
        """Save poster image to local storage and return local path."""
        try:
            import os
            import requests
            from PIL import Image
            import io
            
            # Create posters directory if it doesn't exist
            poster_dir = os.path.join("static", "posters")
            os.makedirs(poster_dir, exist_ok=True)
            
            # Download and save poster
            response = requests.get(poster_url, timeout=10)
            if response.status_code == 200:
                # Open image and convert to RGB if necessary
                img = Image.open(io.BytesIO(response.content))
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Save as JPEG
                poster_filename = f"{imdb_id}.jpg"
                poster_path = os.path.join(poster_dir, poster_filename)
                img.save(poster_path, 'JPEG', quality=85)
                
                return f"/static/posters/{poster_filename}"
            else:
                logger.warning(f"Failed to download poster for {imdb_id}: {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"Error saving poster for {imdb_id}: {e}")
            return None

    def check_jellyfin_for_new_movies(self) -> Dict[str, int]:
        """Check Jellyfin for new movies and update quality information."""
        logger.info("Checking Jellyfin for new movies...")
        
        try:
            jellyfin_service = create_jellyfin_service()
            
            if not jellyfin_service.test_connection():
                logger.warning("Failed to connect to Jellyfin server")
                return {"imported": 0, "updated": 0, "skipped": 0}
            
            # Get all movies from Jellyfin
            jellyfin_movies = jellyfin_service.get_movies()
            
            if not jellyfin_movies:
                logger.info("No movies found in Jellyfin library")
                return {"imported": 0, "updated": 0, "skipped": 0}
            
            imported_count = 0
            updated_count = 0
            skipped_count = 0
            
            with Session(engine) as session:
                for jellyfin_movie in jellyfin_movies:
                    imdb_id = jellyfin_movie.get('imdb_id')
                    if not imdb_id:
                        skipped_count += 1
                        continue
                    
                    # Check if movie already exists in watchlist
                    existing_movie = session.exec(
                        select(Movie).where(Movie.imdb_id == imdb_id)
                    ).first()
                    
                    if existing_movie:
                        # Update existing movie with quality info
                        if existing_movie.quality != jellyfin_movie.get('quality'):
                            existing_movie.quality = jellyfin_movie.get('quality')
                            session.add(existing_movie)
                            updated_count += 1
                            logger.info(f"Updated quality for {existing_movie.title}: {jellyfin_movie.get('quality')}")
                    else:
                        # Import new movie with sequels
                        try:
                            from tmdb_service import get_tmdb_movie_by_imdb, get_collection_movies_by_imdb, movie_api, find_api
                            tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
                            if not tmdb_movie:
                                skipped_count += 1
                                continue
                            
                            # Create new movie
                            poster_url = None
                            if tmdb_movie.get('poster_path'):
                                tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{tmdb_movie['poster_path']}"
                                poster_url = self.save_poster_image(tmdb_poster_url, imdb_id)
                            if not poster_url:
                                poster_url = "/static/no-image.png"
                            
                            new_movie = Movie(
                                title=tmdb_movie.get('title', jellyfin_movie.get('name', 'Unknown')),
                                imdb_id=imdb_id,
                                release_date=tmdb_movie.get('release_date'),
                                quality=jellyfin_movie.get('quality'),
                                overview=tmdb_movie.get('overview'),  # Add description from TMDB
                                poster_url=poster_url,
                                collection_id=tmdb_movie.get('belongs_to_collection', {}).get('id') if tmdb_movie.get('belongs_to_collection') else None,
                                collection_name=tmdb_movie.get('belongs_to_collection', {}).get('name') if tmdb_movie.get('belongs_to_collection') else None,
                                type="movie",
                                added_at=datetime.now(timezone.utc)  # Explicitly set current timestamp
                            )
                            session.add(new_movie)
                            session.commit()
                            imported_count += 1
                            logger.info(f"Imported new movie from Jellyfin: {new_movie.title}")
                            
                            # Import sequels if available
                            try:
                                collection_movies = get_collection_movies_by_imdb(imdb_id)
                                logger.info(f"Found {len(collection_movies)} movies in collection for {imdb_id}")
                                for sequel in collection_movies:
                                    if sequel.get('imdb_id') != imdb_id:  # Skip the original
                                        logger.info(f"Processing sequel: {sequel.get('title', 'Unknown')} (IMDB: {sequel.get('imdb_id')})")
                                        
                                        # Get full details for sequel to ensure we have IMDB ID
                                        tmdb_id = sequel.get('id')
                                        if tmdb_id:
                                            try:
                                                full_details = movie_api.details(tmdb_id)
                                                sequel_imdb_id = getattr(full_details, 'imdb_id', None)
                                                if not sequel_imdb_id:
                                                    # Fallback: try to fetch IMDB ID using find_api
                                                    logger.info(f"No IMDB ID in TMDB details for {sequel.get('title')}, trying find_api fallback...")
                                                    try:
                                                        find_result = find_api.find(tmdb_id, external_source='tmdb_id')
                                                        if find_result and 'movie_results' in find_result and find_result['movie_results']:
                                                            sequel_imdb_id = find_result['movie_results'][0].get('imdb_id')
                                                            logger.info(f"Fallback IMDB ID for {sequel.get('title')}: {sequel_imdb_id}")
                                                    except Exception as e:
                                                        logger.error(f"Fallback find_api failed for {sequel.get('title')}: {e}")
                                                
                                                if not sequel_imdb_id:
                                                    logger.warning(f"Skipping {sequel.get('title')} - No IMDB ID in TMDB details or fallback.")
                                                    continue
                                                
                                                # Check if sequel already exists
                                                existing_sequel = session.exec(
                                                    select(Movie).where(Movie.imdb_id == sequel_imdb_id)
                                                ).first()
                                                if existing_sequel:
                                                    logger.info(f"Skipping {sequel.get('title')} - Already exists in DB")
                                                    continue
                                                
                                                # Construct poster URL for sequel
                                                sequel_poster_path = getattr(full_details, 'poster_path', None)
                                                sequel_poster_url = None
                                                if sequel_poster_path:
                                                    tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{sequel_poster_path}"
                                                    sequel_poster_url = self.save_poster_image(tmdb_poster_url, sequel_imdb_id)
                                                if not sequel_poster_url:
                                                    sequel_poster_url = "/static/no-image.png"
                                                
                                                # Get collection info for sequel
                                                collection = getattr(full_details, 'belongs_to_collection', None)
                                                sequel_collection_id = collection.id if collection and hasattr(collection, 'id') else new_movie.collection_id
                                                sequel_collection_name = collection.name if collection and hasattr(collection, 'name') else new_movie.collection_name
                                                
                                                sequel_movie = Movie(
                                                    title=getattr(full_details, 'title', sequel.get('title', 'Unknown')),
                                                    imdb_id=sequel_imdb_id,
                                                    release_date=getattr(full_details, 'release_date', sequel.get('release_date')),
                                                    poster_url=sequel_poster_url,
                                                    collection_id=sequel_collection_id,
                                                    collection_name=sequel_collection_name,
                                                    type="movie",
                                                    added_at=datetime.now(timezone.utc)  # Explicitly set current timestamp
                                                )
                                                session.add(sequel_movie)
                                                session.commit()  # Commit each sequel immediately
                                                logger.info(f"Successfully added sequel: {sequel_movie.title} to database")
                                            except Exception as e:
                                                logger.error(f"Failed to get full details for sequel {sequel.get('title', 'Unknown')}: {e}")
                                                session.rollback()
                                        else:
                                            logger.warning(f"No TMDB ID found for sequel {sequel.get('title', 'Unknown')}")
                            except Exception as e:
                                logger.warning(f"Failed to import sequels for {imdb_id}: {e}")
                            
                        except Exception as e:
                            logger.error(f"Error importing movie {imdb_id}: {e}")
                            skipped_count += 1
                            session.rollback()  # Rollback on error
                            continue
                
                session.commit()
            
            logger.info(f"Jellyfin check complete: {imported_count} imported, {updated_count} updated, {skipped_count} skipped")
            return {"imported": imported_count, "updated": updated_count, "skipped": skipped_count}
            
        except Exception as e:
            logger.error(f"Error checking Jellyfin: {e}")
            return {"imported": 0, "updated": 0, "skipped": 0}
    
    def run_full_check(self) -> Dict[str, Any]:
        """Run a complete check for new releases."""
        logger.info("Starting release check...")
        
        # Check for new episodes
        new_episodes = self.check_series_for_new_episodes()
        if new_episodes:
            self.add_new_episodes_to_database(new_episodes)
            self.mark_series_as_new(list(set(ep['series_id'] for ep in new_episodes)))
        
        # Check for new movies
        new_movies = self.check_movies_for_new_releases()
        if new_movies:
            self.add_new_movies_to_database(new_movies)
        
        # Check Jellyfin for new movies and quality updates
        jellyfin_results = self.check_jellyfin_for_new_movies()
        
        # Prepare results
        results = {
            'timestamp': datetime.now().isoformat(),
            'new_episodes': len(new_episodes),
            'new_movies': len(new_movies),
            'episodes': new_episodes,
            'movies': new_movies,
            'jellyfin_imported': jellyfin_results['imported'],
            'jellyfin_updated': jellyfin_results['updated'],
            'jellyfin_skipped': jellyfin_results['skipped']
        }
        
        logger.info(f"Release check complete. Found {len(new_episodes)} new episodes, {len(new_movies)} new movies, and Jellyfin: {jellyfin_results['imported']} imported, {jellyfin_results['updated']} updated.")
        return results

def main():
    """Main function to run the release checker."""
    checker = ReleaseChecker()
    results = checker.run_full_check()
    
    # Save results to a file for the API to read
    with open('release_check_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"Release check complete: {results['new_episodes']} new episodes, {results['new_movies']} new movies")

if __name__ == "__main__":
    main() 