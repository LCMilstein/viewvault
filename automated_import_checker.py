#!/usr/bin/env python3
"""
Automated Import Checker for ViewVault

This script runs hourly to check for new content in previously imported Jellyfin libraries.
It only processes libraries that were manually imported by users, ensuring automated
updates don't interfere with user control.

Usage:
    python automated_import_checker.py

Cron setup:
    0 * * * * /path/to/python /path/to/automated_import_checker.py
"""

import os
import sys
import logging
from datetime import datetime, timezone, timedelta
from sqlmodel import Session, select
from database import engine
from models import User, LibraryImportHistory, Movie, Series
from jellyfin_service import create_jellyfin_service
from tmdb_service import get_collection_movies_by_tmdb_id
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('automated_import.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

def get_users_with_automated_libraries():
    """Get all users who have libraries set for automated imports"""
    with Session(engine) as session:
        # Get libraries that were manually imported and are set for automation
        automated_libraries = session.exec(
            select(LibraryImportHistory).where(
                LibraryImportHistory.is_automated == True,
                LibraryImportHistory.deleted == False
            )
        ).all()
        
        # Group by user
        users_libraries = {}
        for lib in automated_libraries:
            if lib.user_id not in users_libraries:
                users_libraries[lib.user_id] = []
            users_libraries[lib.user_id].append(lib)
        
        return users_libraries

def check_library_for_updates(user_id: int, library_info: LibraryImportHistory):
    """Check a specific library for new content and import if found"""
    try:
        logger.info(f"Checking library '{library_info.library_name}' for user {user_id}")
        
        # Create Jellyfin service
        jellyfin_service = create_jellyfin_service()
        if not jellyfin_service.test_connection():
            logger.error(f"Failed to connect to Jellyfin for user {user_id}")
            return False
        
        # Get current movies in the library
        current_movies = jellyfin_service.get_movies(library_ids=[library_info.library_id])
        if not current_movies:
            logger.info(f"No movies found in library '{library_info.library_name}' for user {user_id}")
            return False
        
        # Get existing movies for this user
        with Session(engine) as session:
            existing_movies = session.exec(
                select(Movie).where(
                    Movie.user_id == user_id,
                    Movie.deleted == False
                )
            ).all()
            
            existing_imdb_ids = {movie.imdb_id for movie in existing_movies}
            
            # Check for new movies
            new_movies = []
            for jellyfin_movie in current_movies:
                imdb_id = jellyfin_movie.get('imdb_id')
                if imdb_id and imdb_id not in existing_imdb_ids:
                    new_movies.append(jellyfin_movie)
            
            if not new_movies:
                logger.info(f"No new movies found in library '{library_info.library_name}' for user {user_id}")
                return False
            
            logger.info(f"Found {len(new_movies)} new movies in library '{library_info.library_name}' for user {user_id}")
            
            # Import new movies
            imported_count = 0
            for jellyfin_movie in new_movies:
                try:
                    imdb_id = jellyfin_movie.get('imdb_id')
                    movie_name = jellyfin_movie.get('name', 'Unknown')
                    
                    # Get TMDB details
                    from tmdb_service import get_tmdb_movie_by_imdb
                    tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
                    
                    if tmdb_movie:
                        # Create new movie
                        new_movie = Movie(
                            title=movie_name,
                            imdb_id=imdb_id,
                            release_date=tmdb_movie.get('release_date'),
                            runtime=tmdb_movie.get('runtime'),
                            poster_url=tmdb_movie.get('poster_path'),
                            overview=tmdb_movie.get('overview'),
                            collection_id=tmdb_movie.get('belongs_to_collection', {}).get('id') if tmdb_movie.get('belongs_to_collection') else None,
                            collection_name=tmdb_movie.get('belongs_to_collection', {}).get('name') if tmdb_movie.get('belongs_to_collection') else None,
                            type="movie",
                            user_id=user_id,
                            is_new=0,  # Not new for nightly cron
                            quality=jellyfin_movie.get('quality'),
                            imported_at=datetime.now(timezone.utc)
                        )
                        
                        session.add(new_movie)
                        imported_count += 1
                        logger.info(f"Imported new movie: {movie_name}")
                        
                        # Import sequels if this is part of a collection
                        if new_movie.collection_id and new_movie.collection_name:
                            try:
                                collection_movies = get_collection_movies_by_tmdb_id(new_movie.collection_id)
                                if collection_movies:
                                    for sequel in collection_movies:
                                        if sequel.get('imdb_id') and sequel.get('imdb_id') not in existing_imdb_ids:
                                            # Check if sequel already exists
                                            existing_sequel = session.exec(
                                                select(Movie).where(
                                                    Movie.imdb_id == sequel.get('imdb_id'),
                                                    Movie.user_id == user_id
                                                )
                                            ).first()
                                            
                                            if not existing_sequel:
                                                poster_path = sequel.get('poster_path')
                                                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
                                                
                                                sequel_movie = Movie(
                                                    title=sequel.get('title', 'Unknown'),
                                                    imdb_id=sequel.get('imdb_id'),
                                                    release_date=sequel.get('release_date'),
                                                    runtime=sequel.get('runtime'),
                                                    poster_url=poster_url,
                                                    overview=sequel.get('overview'),
                                                    collection_id=new_movie.collection_id,
                                                    collection_name=new_movie.collection_name,
                                                    type="movie",
                                                    user_id=user_id,
                                                    is_new=0,
                                                    imported_at=datetime.now(timezone.utc)
                                                )
                                                session.add(sequel_movie)
                                                imported_count += 1
                                                logger.info(f"Imported sequel: {sequel_movie.title}")
                            except Exception as e:
                                logger.warning(f"Failed to import sequels for {movie_name}: {e}")
                                continue
                    
                except Exception as e:
                    logger.error(f"Failed to import movie {jellyfin_movie.get('name', 'Unknown')}: {e}")
                    continue
            
            # Update library import history
            library_info.last_imported = datetime.now(timezone.utc)
            library_info.import_count += 1
            session.add(library_info)
            
            # Commit all changes
            session.commit()
            
            logger.info(f"Successfully imported {imported_count} new movies for user {user_id} from library '{library_info.library_name}'")
            return True
            
    except Exception as e:
        logger.error(f"Error checking library '{library_info.library_name}' for user {user_id}: {e}")
        return False

def main():
    """Main function to run automated import checks"""
    logger.info("Starting automated import checker...")
    
    try:
        # Get users with automated libraries
        users_libraries = get_users_with_automated_libraries()
        
        if not users_libraries:
            logger.info("No users with automated libraries found")
            return
        
        logger.info(f"Found {len(users_libraries)} users with automated libraries")
        
        total_imports = 0
        successful_imports = 0
        
        # Process each user's libraries
        for user_id, libraries in users_libraries.items():
            logger.info(f"Processing user {user_id} with {len(libraries)} automated libraries")
            
            for library_info in libraries:
                total_imports += 1
                
                # Check if library was imported recently (within last 6 hours)
                time_since_last_import = datetime.now(timezone.utc) - library_info.last_imported
                if time_since_last_import < timedelta(hours=6):
                    logger.info(f"Library '{library_info.library_name}' was imported recently, skipping")
                    continue
                
                # Check library for updates
                if check_library_for_updates(user_id, library_info):
                    successful_imports += 1
                
                # Rate limiting between libraries
                time.sleep(2)
        
        logger.info(f"Automated import checker completed: {successful_imports}/{total_imports} libraries processed successfully")
        
    except Exception as e:
        logger.error(f"Error in automated import checker: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
