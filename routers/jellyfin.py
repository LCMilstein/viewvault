"""
Jellyfin import and debug endpoints for ViewVault.
"""

import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from database import engine
from models import Movie, Series, User, List, ListItem, LibraryImportHistory
from deps import get_current_user, get_current_admin_user, limiter, rate_limit_tmdb
from tmdb_service import get_tmdb_movie_by_imdb, get_collection_movies_by_tmdb_id
from jellyfin_service import create_jellyfin_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/import/jellyfin/progress")
async def get_import_progress(current_user: User = Depends(get_current_user)):
    """Get current import progress for the authenticated user"""
    try:
        return {
            "phase": "No import in progress",
            "progress": 0,
            "current": 0,
            "total": 0,
            "batch_num": 0,
            "total_batches": 0
        }
    except Exception as e:
        logger.error(f"Error getting progress: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get progress: {str(e)}")


@router.get("/import/jellyfin/pre-scan/{library_name}")
async def pre_scan_jellyfin_library(library_name: str, current_user: User = Depends(get_current_user)):
    """Pre-scan a Jellyfin library to count total work for progress tracking"""
    try:
        logger.info(f"Pre-scanning Jellyfin library '{library_name}' for user {current_user.username}")
        jellyfin_service = create_jellyfin_service()

        if not jellyfin_service.test_connection():
            raise HTTPException(status_code=502, detail="Failed to connect to Jellyfin server")

        # Get available libraries first
        try:
            libraries = jellyfin_service.get_libraries()
            logger.info(f"Libraries retrieved: {libraries}")
        except Exception as e:
            logger.error(f"Failed to get libraries: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get Jellyfin libraries: {str(e)}")

        if not libraries:
            logger.warning("No movie libraries found in Jellyfin")
            raise HTTPException(status_code=400, detail="No movie libraries found in Jellyfin")

        # Find the specific library
        target_library = None
        for lib in libraries:
            if lib.get('name') == library_name:
                target_library = lib
                break

        if not target_library:
            available_libraries = [lib.get('name', 'Unknown') for lib in libraries]
            logger.warning(f"Library '{library_name}' not found. Available libraries: {available_libraries}")
            raise HTTPException(status_code=404, detail=f"Library '{library_name}' not found. Available libraries: {available_libraries}")

        # Get movies from the specific library
        try:
            jellyfin_movies = jellyfin_service.get_movies(library_ids=[target_library['id']])
            logger.info(f"Movies retrieved: {len(jellyfin_movies) if jellyfin_movies else 0} movies")
        except Exception as e:
            logger.error(f"Failed to get movies: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get movies from Jellyfin: {str(e)}")

        if not jellyfin_movies:
            raise HTTPException(status_code=404, detail=f"No movies found in library '{library_name}'")

        # Count total work
        total_movies = len(jellyfin_movies)
        estimated_collections = total_movies // 10  # Rough estimate of collections

        return {
            "total_movies": total_movies,
            "estimated_collections": estimated_collections,
            "total_work": total_movies + estimated_collections,
            "library_name": library_name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pre-scan failed: {e}")
        raise HTTPException(status_code=500, detail=f"Pre-scan failed: {str(e)}")


@router.post("/import/jellyfin/")
@limiter.limit("100/hour")
async def import_from_jellyfin(request: Request, current_user: User = Depends(get_current_user)):
    logger.info(f"Jellyfin import called by user: {current_user.username if current_user else 'None'}")
    """Import movies from Jellyfin library with quality information"""
    # Get library name and target lists from request body
    try:
        data = await request.json()
        library_name = data.get('library_name', 'Movies')
        target_list_ids = data.get('list_ids', [])
    except Exception:
        library_name = 'Movies'
        target_list_ids = []

    logger.info(f"Importing from Jellyfin library: {library_name}")
    try:
        logger.info("Starting Jellyfin import...")
        try:
            # Debug environment variables
            logger.info(f"JELLYFIN_URL: {os.getenv('JELLYFIN_URL')}")
            logger.info(f"JELLYFIN_API_KEY: {os.getenv('JELLYFIN_API_KEY')[:10] + '...' if os.getenv('JELLYFIN_API_KEY') else 'None'}")
            logger.info(f"JELLYFIN_USER_ID: {os.getenv('JELLYFIN_USER_ID')[:10] + '...' if os.getenv('JELLYFIN_USER_ID') else 'None'}")

            jellyfin_service = create_jellyfin_service()
            logger.info(f"Jellyfin service created successfully: {type(jellyfin_service)}")
        except Exception as e:
            logger.error(f"Failed to create Jellyfin service: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to create Jellyfin service: {str(e)}")

        logger.info("Testing Jellyfin connection...")
        if not jellyfin_service.test_connection():
            logger.error("Failed to connect to Jellyfin server")
            raise HTTPException(status_code=502, detail="Failed to connect to Jellyfin server")

        # Get available libraries first
        logger.info("Getting Jellyfin libraries...")
        try:
            libraries = jellyfin_service.get_libraries()
            logger.info(f"Libraries retrieved: {libraries}")
        except Exception as e:
            logger.error(f"Failed to get libraries: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get Jellyfin libraries: {str(e)}")

        if not libraries:
            logger.warning("No movie libraries found in Jellyfin")
            raise HTTPException(status_code=400, detail="No movie libraries found in Jellyfin")

        logger.info(f"Found {len(libraries)} movie libraries: {[lib['name'] for lib in libraries]}")

        # Find the specific library
        target_library = None
        for lib in libraries:
            if lib.get('name') == library_name:
                target_library = lib
                break

        if not target_library:
            available_libraries = [lib.get('name', 'Unknown') for lib in libraries]
            logger.warning(f"Library '{library_name}' not found. Available libraries: {available_libraries}")
            raise HTTPException(status_code=404, detail=f"Library '{library_name}' not found. Available libraries: {available_libraries}")

        logger.info(f"Using library: {target_library}")

        # Get movies from the specific library
        logger.info(f"Getting movies from library: {library_name}")
        try:
            jellyfin_movies = jellyfin_service.get_movies(library_ids=[target_library['id']])
            logger.info(f"Movies retrieved: {len(jellyfin_movies) if jellyfin_movies else 0} movies")
        except Exception as e:
            logger.error(f"Failed to get movies: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to get movies from Jellyfin: {str(e)}")

        if not jellyfin_movies:
            logger.warning("No movies found in Jellyfin movie libraries")
            return {"message": "No movies found in Jellyfin movie libraries"}

        logger.info(f"Retrieved {len(jellyfin_movies)} movies from Jellyfin")

        # Start progress tracking
        from progress_tracker import progress_tracker
        estimated_collections = len(jellyfin_movies) // 10
        import_id = progress_tracker.start_import(library_name, len(jellyfin_movies), estimated_collections)
        logger.info(f"Started progress tracking with ID: {import_id}")

        imported_count = 0
        updated_count = 0
        skipped_count = 0
        errors = []

        # Performance optimization: Batch process movies
        with Session(engine) as session:
            logger.info(f"Processing {len(jellyfin_movies)} movies from Jellyfin")

            # Process movies with valid IMDB IDs
            valid_movies = []

            for jellyfin_movie in jellyfin_movies:
                imdb_id = jellyfin_movie.get('imdb_id')
                movie_name = jellyfin_movie.get('name', 'Unknown')

                # Debug: log what we're getting from Jellyfin
                logger.info(f"Processing Jellyfin item: {movie_name}")
                logger.info(f"  - IMDB ID: {imdb_id}")
                logger.info(f"  - Provider IDs: {jellyfin_movie.get('provider_ids', 'None')}")
                logger.info(f"  - Type: {jellyfin_movie.get('type', 'Unknown')}")

                if not imdb_id or imdb_id == 'None' or imdb_id == '':
                    logger.info(f"Counting as skipped - no IMDB ID: {movie_name}")
                    skipped_count += 1
                    if not hasattr(request.state, 'skipped_items'):
                        request.state.skipped_items = []
                    request.state.skipped_items.append({
                        'title': movie_name,
                        'reason': 'No IMDB ID - likely educational content or typo'
                    })
                    continue
                else:
                    valid_movies.append(jellyfin_movie)

            logger.info(f"Processing {len(valid_movies)} movies with valid IMDB IDs")

            # Batch fetch existing movies from database for current user
            existing_imdb_ids = set()
            if valid_movies:
                imdb_ids = [movie.get('imdb_id') for movie in valid_movies]
                existing_movies = session.exec(
                    select(Movie).where(Movie.imdb_id.in_(imdb_ids), Movie.user_id == current_user.id, Movie.deleted == False)
                ).all()
                existing_imdb_ids = {movie.imdb_id for movie in existing_movies}
                logger.info(f"Found {len(existing_imdb_ids)} existing movies in database for user {current_user.id}")

            # Process movies in batches
            batch_size = 10
            total_batches = (len(valid_movies) + batch_size - 1) // batch_size
            imported_movies = []  # Track movies for sequel processing
            for i in range(0, len(valid_movies), batch_size):
                batch = valid_movies[i:i + batch_size]
                batch_num = i // batch_size + 1
                logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} movies)")

                for jellyfin_movie in batch:
                    try:
                        imdb_id = jellyfin_movie.get('imdb_id')
                        movie_name = jellyfin_movie.get('name', 'Unknown')
                        logger.info(f"Processing movie: {movie_name} (IMDB: {imdb_id})")

                        if imdb_id in existing_imdb_ids:
                            # Update existing movie with quality info
                            existing_movie = session.exec(
                                select(Movie).where(Movie.imdb_id == imdb_id, Movie.user_id == current_user.id, Movie.deleted == False)
                            ).first()

                            if existing_movie:
                                old_quality = existing_movie.quality
                                new_quality = jellyfin_movie.get('quality')
                                logger.info(f"Checking {movie_name}: DB quality='{old_quality}' vs Jellyfin quality='{new_quality}'")

                                # Normalize qualities for comparison
                                def normalize_quality(q):
                                    if q in [None, "Unknown", "", "unknown", "SD"]:
                                        return "low_quality"
                                    return q

                                db_quality_normalized = normalize_quality(old_quality)
                                jf_quality_normalized = normalize_quality(new_quality)

                            if existing_movie and db_quality_normalized != jf_quality_normalized:
                                existing_movie.quality = new_quality
                                session.add(existing_movie)
                                updated_count += 1
                                logger.info(f"Updated quality for {movie_name}: '{old_quality}' -> '{new_quality}'")

                                # Add to specified lists (if any)
                                if target_list_ids:
                                    for list_id in target_list_ids:
                                        if list_id != "personal":
                                            try:
                                                target_list = session.exec(
                                                    select(List).where(List.id == list_id, List.user_id == current_user.id, List.deleted == False)
                                                ).first()
                                                if target_list:
                                                    existing_item = session.exec(
                                                        select(ListItem).where(ListItem.list_id == list_id, ListItem.item_type == "movie", ListItem.item_id == existing_movie.id, ListItem.deleted == False)
                                                    ).first()
                                                    if not existing_item:
                                                        new_list_item = ListItem(list_id=list_id, item_type="movie", item_id=existing_movie.id, user_id=current_user.id)
                                                        session.add(new_list_item)
                                                        logger.info(f"Added {movie_name} to list {target_list.name}")
                                                else:
                                                    logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                            except Exception as e:
                                                logger.error(f"Failed to add {movie_name} to list {list_id}: {e}")
                            else:
                                skipped_count += 1
                                logger.info(f"Skipped {movie_name} - already exists with same quality")

                                # Still add to specified lists if needed
                                if target_list_ids and existing_movie:
                                    for list_id in target_list_ids:
                                        if list_id != "personal":
                                            try:
                                                target_list = session.exec(
                                                    select(List).where(List.id == list_id, List.user_id == current_user.id, List.deleted == False)
                                                ).first()
                                                if target_list:
                                                    existing_item = session.exec(
                                                        select(ListItem).where(ListItem.list_id == list_id, ListItem.item_type == "movie", ListItem.item_id == existing_movie.id, ListItem.deleted == False)
                                                    ).first()
                                                    if not existing_item:
                                                        new_list_item = ListItem(list_id=list_id, item_type="movie", item_id=existing_movie.id, user_id=current_user.id)
                                                        session.add(new_list_item)
                                                        logger.info(f"Added {movie_name} to list {target_list.name}")
                                                else:
                                                    logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                            except Exception as e:
                                                logger.error(f"Failed to add {movie_name} to list {list_id}: {e}")
                        else:
                            # Import new movie
                            try:
                                logger.info(f"Looking up movie {imdb_id} in TMDB...")
                                rate_limit_tmdb()
                                tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
                                if not tmdb_movie:
                                    logger.warning(f"Movie {imdb_id} not found in TMDB")
                                    skipped_count += 1
                                    continue
                                logger.info(f"Found TMDB data for {imdb_id}: {tmdb_movie.get('title', 'Unknown')}")

                                poster_path = tmdb_movie.get('poster_path')
                                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
                                logger.info(f"Constructed poster_url: {poster_url}")

                                new_movie = Movie(
                                    title=tmdb_movie.get('title', jellyfin_movie.get('name', 'Unknown')),
                                    imdb_id=imdb_id,
                                    release_date=tmdb_movie.get('release_date'),
                                    quality=jellyfin_movie.get('quality'),
                                    overview=tmdb_movie.get('overview'),
                                    poster_url=poster_url,
                                    collection_id=tmdb_movie.get('belongs_to_collection', {}).get('id') if tmdb_movie.get('belongs_to_collection') else None,
                                    collection_name=tmdb_movie.get('belongs_to_collection', {}).get('name') if tmdb_movie.get('belongs_to_collection') else None,
                                    type="movie",
                                    user_id=current_user.id,
                                    is_new=0,
                                    imported_at=datetime.now(timezone.utc)
                                )
                                session.add(new_movie)
                                session.flush()
                                imported_count += 1
                                if new_movie.collection_id and new_movie.collection_name:
                                    imported_movies.append({
                                        'collection_id': new_movie.collection_id,
                                        'collection_name': new_movie.collection_name
                                    })
                                logger.info(f"Successfully imported {movie_name}")

                                # Add to specified lists (if any)
                                if target_list_ids:
                                    for list_id in target_list_ids:
                                        if list_id != "personal":
                                            try:
                                                target_list = session.exec(
                                                    select(List).where(List.id == list_id, List.user_id == current_user.id, List.deleted == False)
                                                ).first()
                                                if target_list:
                                                    existing_item = session.exec(
                                                        select(ListItem).where(ListItem.list_id == list_id, ListItem.item_type == "movie", ListItem.item_id == new_movie.id, ListItem.deleted == False)
                                                    ).first()
                                                    if not existing_item:
                                                        new_list_item = ListItem(list_id=list_id, item_type="movie", item_id=new_movie.id, user_id=current_user.id)
                                                        session.add(new_list_item)
                                                        logger.info(f"Added {movie_name} to list {target_list.name}")
                                                else:
                                                    logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                            except Exception as e:
                                                logger.error(f"Failed to add {movie_name} to list {list_id}: {e}")

                            except Exception as e:
                                error_msg = f"Error importing movie {imdb_id}: {e}"
                                logger.error(error_msg)
                                errors.append(error_msg)
                                skipped_count += 1
                                continue

                    except Exception as e:
                        error_msg = f"Error processing movie {jellyfin_movie.get('name', 'Unknown')}: {e}"
                        logger.error(error_msg)
                        errors.append(error_msg)
                        skipped_count += 1
                        continue

                # Commit batch
                try:
                    session.commit()
                    logger.info(f"Committed batch {batch_num}/{total_batches}")

                    progress_data = {
                        "phase": f"Completed batch {batch_num}/{total_batches}",
                        "progress": min(80, (batch_num / total_batches) * 80),
                        "current": batch_num * batch_size,
                        "total": len(valid_movies),
                        "batch_num": batch_num,
                        "total_batches": total_batches
                    }

                    if not hasattr(request.state, 'import_progress'):
                        request.state.import_progress = {}
                    request.state.import_progress[current_user.id] = progress_data

                except Exception as e:
                    logger.error(f"Error committing batch: {e}")
                    session.rollback()
                    raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

        # Import sequels in chunks for better performance
        logger.info("Importing sequels for movies with collections...")
        logger.info(f"DEBUG: imported_movies list has {len(imported_movies)} items")

        total_sequels_imported = 0

        # Collect all unique collections to process
        unique_collections = {}
        for movie_data in imported_movies:
            if movie_data['collection_id'] and movie_data['collection_name']:
                if movie_data['collection_id'] not in unique_collections:
                    unique_collections[movie_data['collection_id']] = {
                        'name': movie_data['collection_name'],
                        'movies': []
                    }
                unique_collections[movie_data['collection_id']]['movies'].append(movie_data)

        logger.info(f"Processing {len(unique_collections)} unique collections...")

        chunk_size = 5
        collection_ids = list(unique_collections.keys())

        for i in range(0, len(collection_ids), chunk_size):
            chunk = collection_ids[i:i + chunk_size]
            logger.info(f"Processing chunk {i//chunk_size + 1}/{(len(collection_ids) + chunk_size - 1)//chunk_size}")

            for coll_id in chunk:
                collection_info = unique_collections[coll_id]
                try:
                    logger.info(f"Processing collection '{collection_info['name']}'...")
                    rate_limit_tmdb()
                    collection_movies = get_collection_movies_by_tmdb_id(coll_id)

                    if collection_movies:
                        logger.info(f"Found {len(collection_movies)} movies in collection '{collection_info['name']}'")

                        chunk_sequels_imported = 0
                        for sequel in collection_movies:
                            if sequel.get('imdb_id'):
                                existing_sequel = session.exec(
                                    select(Movie).where(Movie.imdb_id == sequel.get('imdb_id'), Movie.user_id == current_user.id, Movie.deleted == False)
                                ).first()

                                if not existing_sequel:
                                    logger.info(f"Importing sequel: {sequel.get('title', 'Unknown')}")

                                    poster_path = sequel.get('poster_path')
                                    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None

                                    sequel_movie = Movie(
                                        title=sequel.get('title', 'Unknown'),
                                        imdb_id=sequel.get('imdb_id'),
                                        release_date=sequel.get('release_date'),
                                        runtime=sequel.get('runtime'),
                                        poster_url=poster_url,
                                        overview=sequel.get('overview'),
                                        collection_id=coll_id,
                                        collection_name=collection_info['name'],
                                        type="movie",
                                        user_id=current_user.id,
                                        is_new=0,
                                        imported_at=datetime.now(timezone.utc)
                                    )
                                    session.add(sequel_movie)
                                    total_sequels_imported += 1
                                    chunk_sequels_imported += 1
                                    logger.info(f"Successfully added sequel: {sequel_movie.title}")

                                    # Add sequel to specified lists (if any)
                                    if target_list_ids:
                                        for list_id in target_list_ids:
                                            if list_id != "personal":
                                                try:
                                                    target_list = session.exec(
                                                        select(List).where(List.id == list_id, List.user_id == current_user.id, List.deleted == False)
                                                    ).first()
                                                    if target_list:
                                                        existing_item = session.exec(
                                                            select(ListItem).where(ListItem.list_id == list_id, ListItem.item_type == "movie", ListItem.item_id == sequel_movie.id, ListItem.deleted == False)
                                                        ).first()
                                                        if not existing_item:
                                                            new_list_item = ListItem(list_id=list_id, item_type="movie", item_id=sequel_movie.id, user_id=current_user.id)
                                                            session.add(new_list_item)
                                                            logger.info(f"Added sequel {sequel_movie.title} to list {target_list.name}")
                                                    else:
                                                        logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                                except Exception as e:
                                                    logger.error(f"Failed to add sequel {sequel_movie.title} to list {list_id}: {e}")
                                else:
                                    logger.info(f"Skipping {sequel.get('title')} - Already exists in DB")

                        logger.info(f"Completed collection '{collection_info['name']}' - {chunk_sequels_imported} sequels imported")
                    else:
                        logger.info(f"No collection movies found for collection '{collection_info['name']}'")

                except Exception as e:
                    logger.warning(f"Failed to process collection '{collection_info['name']}': {e}")
                    continue

            # Commit after each chunk
            if total_sequels_imported > 0:
                session.commit()
                logger.info(f"Committed chunk {i//chunk_size + 1} - {total_sequels_imported} total sequels imported")

                collection_progress = 80 + ((i // chunk_size + 1) / ((len(collection_ids) + chunk_size - 1) // chunk_size)) * 20
                progress_data = {
                    "phase": f"Processing collections - chunk {i//chunk_size + 1}",
                    "progress": min(95, collection_progress),
                    "current": len(valid_movies) + (i // chunk_size + 1) * chunk_size,
                    "total": len(valid_movies) + len(collection_ids),
                    "batch_num": i//chunk_size + 1,
                    "total_batches": (len(collection_ids) + chunk_size - 1) // chunk_size
                }

                if not hasattr(request.state, 'import_progress'):
                    request.state.import_progress = {}
                request.state.import_progress[current_user.id] = progress_data

        # Commit all sequel imports
        if total_sequels_imported > 0:
            session.commit()
            logger.info(f"Committed {total_sequels_imported} sequel imports")

        # Track library import history for automated updates
        try:
            for library in libraries:
                existing_history = session.exec(
                    select(LibraryImportHistory).where(
                        LibraryImportHistory.user_id == current_user.id,
                        LibraryImportHistory.library_id == library.get('id'),
                        LibraryImportHistory.deleted == False
                    )
                ).first()

                if existing_history:
                    existing_history.last_imported = datetime.now(timezone.utc)
                    existing_history.import_count += 1
                    existing_history.is_automated = True
                    session.add(existing_history)
                    logger.info(f"Updated import history for library '{library.get('name')}' - count: {existing_history.import_count}")
                else:
                    new_history = LibraryImportHistory(
                        user_id=current_user.id,
                        library_name=library.get('name'),
                        library_id=library.get('id'),
                        last_imported=datetime.now(timezone.utc),
                        import_count=1,
                        is_automated=True
                    )
                    session.add(new_history)
                    logger.info(f"Created import history for library '{library.get('name')}'")

            session.commit()
            logger.info("Library import history updated successfully")

            # Complete progress tracking
            progress_tracker.complete_import(import_id)
            logger.info(f"Completed progress tracking for import: {import_id}")

        except Exception as e:
            logger.warning(f"Failed to update library import history: {e}")

        # Get skipped items details if available
        skipped_items = getattr(request.state, 'skipped_items', [])

        return {
            "success": True,
            "message": f"Jellyfin import complete",
            "imported": imported_count,
            "updated": updated_count,
            "skipped": skipped_count,
            "skipped_items": skipped_items,
            "sequels_imported": total_sequels_imported if 'total_sequels_imported' in locals() else 0,
            "total_jellyfin_movies": len(jellyfin_movies),
            "libraries_found": len(libraries),
            "errors": errors[:10] if errors else []
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Jellyfin import failed: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Jellyfin import failed: {str(e)}")


@router.get("/import/jellyfin/libraries")
def get_jellyfin_libraries(current_user: User = Depends(get_current_user)):
    """Get list of available Jellyfin libraries"""
    try:
        logger.info("Getting Jellyfin libraries...")
        jellyfin_service = create_jellyfin_service()

        if not jellyfin_service.test_connection():
            raise HTTPException(status_code=502, detail="Failed to connect to Jellyfin server")

        libraries = jellyfin_service.get_libraries()
        return {
            "libraries": libraries,
            "count": len(libraries),
            "service_type": str(type(jellyfin_service))
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get Jellyfin libraries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get Jellyfin libraries: {str(e)}")


@router.get("/import/jellyfin/libraries-debug")
def get_jellyfin_libraries_debug(current_user: User = Depends(get_current_user)):
    """Get list of available Jellyfin libraries (auth required)"""
    try:
        logger.info("Getting Jellyfin libraries (debug mode)...")
        jellyfin_service = create_jellyfin_service()

        if not jellyfin_service.test_connection():
            raise HTTPException(status_code=502, detail="Failed to connect to Jellyfin server")

        libraries = jellyfin_service.get_libraries()
        return {
            "libraries": libraries,
            "count": len(libraries),
            "service_type": str(type(jellyfin_service))
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get Jellyfin libraries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get Jellyfin libraries: {str(e)}")


@router.get("/import/jellyfin/debug")
def debug_jellyfin(current_user: User = Depends(get_current_admin_user)):
    """Debug Jellyfin connection and service (admin only)"""
    try:
        logger.info("Debugging Jellyfin service...")

        jellyfin_service = create_jellyfin_service()
        service_info = {
            "service_type": str(type(jellyfin_service)),
            "is_mock": "MockJellyfinService" in str(type(jellyfin_service))
        }

        connection_ok = jellyfin_service.test_connection()
        available_methods = [method for method in dir(jellyfin_service) if not method.startswith('_')]

        try:
            libraries = jellyfin_service.get_libraries()
            kids_library = None
            for lib in libraries:
                if lib.get('name') == 'Kids Movies':
                    kids_library = lib
                    break

            if kids_library:
                movies = jellyfin_service.get_movies(library_ids=[kids_library['id']])
            else:
                movies = jellyfin_service.get_movies()
        except Exception as e:
            logger.warning(f"Could not filter by library: {e}")
            movies = jellyfin_service.get_movies()

        sample_movies = movies[:3] if movies else []

        return {
            "service_info": service_info,
            "connection_ok": connection_ok,
            "available_methods": available_methods,
            "movies_count": len(movies) if movies else 0,
            "sample_movies": sample_movies,
            "env_vars": {
                "JELLYFIN_URL": "SET" if os.getenv('JELLYFIN_URL') else "NOT_SET",
                "JELLYFIN_API_KEY": "SET" if os.getenv('JELLYFIN_API_KEY') else "NOT_SET",
                "JELLYFIN_USER_ID": "SET" if os.getenv('JELLYFIN_USER_ID') else "NOT_SET"
            }
        }
    except Exception as e:
        logger.error(f"Jellyfin debug failed: {e}")
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }


@router.get("/import/jellyfin/test-auth")
def test_jellyfin_auth():
    """Test if authentication is working for Jellyfin endpoints"""
    return {
        "authenticated": True,
        "user": "test_user",
        "is_admin": True
    }


@router.get("/import/jellyfin/test-libraries")
def test_jellyfin_libraries():
    """Test getting movies from different libraries"""
    try:
        jellyfin_service = create_jellyfin_service()

        test_library_ids = ['1', '2', '3', '4', '5']
        results = {}

        for lib_id in test_library_ids:
            try:
                movies = jellyfin_service.get_movies(library_ids=[lib_id])
                if movies:
                    results[lib_id] = {
                        'count': len(movies),
                        'sample': movies[:2],
                        'has_imdb_ids': any(m.get('imdb_id') for m in movies[:5])
                    }
            except Exception as e:
                results[lib_id] = {'error': str(e)}

        return {
            'library_tests': results,
            'total_libraries_found': len([r for r in results.values() if 'count' in r])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/import/jellyfin/debug-movie-data")
def debug_movie_data(current_user: User = Depends(get_current_admin_user)):
    """Debug the raw movie data from Jellyfin to see provider IDs (admin only)"""
    try:
        jellyfin_service = create_jellyfin_service()

        movies = jellyfin_service.get_movies()
        sample_movies = movies[:5] if movies else []

        debug_data = []
        for movie in sample_movies:
            debug_data.append({
                'name': movie.get('name'),
                'imdb_id': movie.get('imdb_id'),
                'tmdb_id': movie.get('tmdb_id'),
                'quality': movie.get('quality'),
                'has_imdb': movie.get('imdb_id') is not None
            })

        return {
            "sample_movies": debug_data,
            "total_movies": len(movies) if movies else 0,
            "movies_with_imdb": len([m for m in movies if m.get('imdb_id')]) if movies else 0,
            "movies_without_imdb": len([m for m in movies if not m.get('imdb_id')]) if movies else 0
        }
    except Exception as e:
        logger.error(f"Debug movie data failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/import/jellyfin/debug-provider-ids")
def debug_provider_ids(current_user: User = Depends(get_current_admin_user)):
    """Debug the raw provider IDs from Jellyfin to see what keys are available (admin only)"""
    try:
        jellyfin_service = create_jellyfin_service()

        libraries = jellyfin_service.get_libraries()
        if not libraries:
            raise HTTPException(status_code=404, detail="No libraries found")

        library_id = libraries[0]['id']
        params = {
            'IncludeItemTypes': 'Movie',
            'Recursive': 'true',
            'Fields': 'ProviderIds',
            'ImageTypeLimit': '0',
            'ParentId': library_id,
            'Limit': '5'
        }

        response = jellyfin_service.session.get(f"{jellyfin_service.server_url}/Items", params=params)
        if response.status_code == 200:
            data = response.json()
            items = data.get('Items', [])

            debug_data = []
            for item in items:
                provider_ids = item.get('ProviderIds', {})
                debug_data.append({
                    'name': item.get('Name'),
                    'id': item.get('Id'),
                    'provider_ids': provider_ids,
                    'provider_keys': list(provider_ids.keys()) if provider_ids else [],
                    'has_imdb': 'Imdb' in provider_ids or 'imdb' in provider_ids or 'IMDB' in provider_ids
                })

            return {
                "sample_movies": debug_data,
                "total_items": len(items),
                "library_used": libraries[0]['name']
            }
        else:
            raise HTTPException(status_code=502, detail=f"Failed to get items from Jellyfin: {response.status_code}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Debug provider IDs failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
