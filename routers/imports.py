"""
TMDB/IMDB import endpoints for ViewVault.

Includes movie import (with sequels), series import, URL-based import, and share import.
"""

import re
import logging
import requests
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from database import engine
from models import Movie, Series, Episode, User, List, ListItem
from deps import get_current_user, get_current_admin_user, imdb_service
from tmdb_service import (
    movie_api, find_api, get_tmdb_movie_by_imdb, get_tmdb_series_by_imdb,
    get_tv_details_with_imdb, get_collection_movies_by_imdb,
    get_all_episodes_by_imdb
)
from utils import (
    extract_imdb_id_from_url, get_imdb_id_from_tvmaze_url,
    get_series_from_tvmaze_by_imdb, save_poster_image
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/import/movie/{imdb_id}")
async def import_movie(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a movie from IMDB by ID to specified lists"""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []

    movie_details = imdb_service.get_movie_details(imdb_id)
    if not movie_details:
        raise HTTPException(status_code=404, detail="Movie not found on IMDB")

    # Try to get collection info from TMDB
    tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
    collection_id = None
    collection_name = None
    if tmdb_movie:
        collection = tmdb_movie.get('belongs_to_collection')
        if collection and 'id' in collection:
            collection_id = collection['id']
            collection_name = collection.get('name')
            logger.info(f"Found collection: {collection_name} (ID: {collection_id}) for {imdb_id}")
    else:
        logger.info(f"No TMDB movie data found for {imdb_id}")

    # Check if movie already exists for this user
    with Session(engine) as session:
        # Check if movie exists globally for this user
        existing_movie = session.exec(select(Movie).where(Movie.imdb_id == imdb_id, Movie.user_id == current_user.id, Movie.deleted == False)).first()

        # If movie exists, check if it's already in the target lists
        if existing_movie and target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":  # Skip personal list as it's virtual
                    # Check if movie is already in this specific list
                    existing_item = session.exec(
                        select(ListItem).where(
                            ListItem.list_id == list_id,
                            ListItem.item_type == "movie",
                            ListItem.item_id == existing_movie.id,
                            ListItem.deleted == False
                        )
                    ).first()

                    if existing_item:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Movie already exists in list '{list_id}'"
                        )

        # If movie doesn't exist, create it
        if not existing_movie:
            # Create new movie
            poster_url = None
            if tmdb_movie and getattr(tmdb_movie, 'poster_path', None):
                tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{tmdb_movie.poster_path}"
                poster_url = save_poster_image(tmdb_poster_url, imdb_id)
            if not poster_url and movie_details.poster_url and movie_details.poster_url.startswith("http"):
                poster_url = save_poster_image(movie_details.poster_url, imdb_id)
            if not poster_url:
                poster_url = "/static/no-image.png"
            # Get runtime from TMDB if available
            runtime = None
            if tmdb_movie and hasattr(tmdb_movie, 'runtime'):
                runtime = getattr(tmdb_movie, 'runtime')

            # Get overview from TMDB if available
            overview = None
            if tmdb_movie and tmdb_movie.get('overview'):
                overview = tmdb_movie.get('overview')

            movie = Movie(
                title=movie_details.title,
                imdb_id=movie_details.imdb_id,
                release_date=movie_details.release_date,
                runtime=runtime,
                watched=False,
                collection_id=collection_id,
                collection_name=collection_name,
                poster_url=poster_url,
                poster_thumb=None,
                overview=overview,
                imported_at=datetime.now(timezone.utc),
                user_id=current_user.id
            )
            session.add(movie)
            session.commit()
            session.refresh(movie)
            logger.info(f"[IMPORT] NEW movie created - ID: {movie.id}, Title: {movie.title}, user_id: {movie.user_id}, imdb_id: {movie.imdb_id}")
        else:
            # Movie already exists, update imported_at timestamp
            existing_movie.imported_at = datetime.now(timezone.utc)
            session.add(existing_movie)
            movie = existing_movie
            logger.info(f"[IMPORT] EXISTING movie updated - ID: {movie.id}, Title: {movie.title}, user_id: {movie.user_id}")

        # Add to specified lists (if any)
        if target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":  # Skip personal list as it's virtual
                    try:
                        # Verify the list exists and user has access
                        target_list = session.exec(
                            select(List).where(
                                List.id == list_id,
                                List.user_id == current_user.id,
                                List.deleted == False
                            )
                        ).first()

                        if target_list:
                            # Check if movie is already in this list
                            existing_item = session.exec(
                                select(ListItem).where(
                                    ListItem.list_id == list_id,
                                    ListItem.item_type == "movie",
                                    ListItem.item_id == movie.id,
                                    ListItem.deleted == False
                                )
                            ).first()

                            if not existing_item:
                                new_list_item = ListItem(
                                    list_id=list_id,
                                    item_type="movie",
                                    item_id=movie.id,
                                    user_id=current_user.id
                                )
                                session.add(new_list_item)
                                logger.info(f"Added {movie.title} to list {target_list.name}")
                        else:
                            logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                    except Exception as e:
                        logger.error(f"Failed to add {movie.title} to list {list_id}: {e}")
                        # Continue with other lists even if one fails

        # Import sequels if available (but don't block the main import)
        try:
            if collection_id and collection_name:
                logger.info(f"Found collection '{collection_name}' for {movie.title}, checking for sequels...")
                collection_movies = get_collection_movies_by_imdb(imdb_id)
                if collection_movies:
                    logger.info(f"Found {len(collection_movies)} movies in collection for {imdb_id}")
                    for sequel in collection_movies:
                        # Skip the original movie (it's already imported)
                        if sequel.get('title') == movie.title:
                            logger.info(f"Skipping original movie: {sequel.get('title')}")
                            continue

                        logger.info(f"Processing sequel: {sequel.get('title', 'Unknown')}")

                        # Get TMDB ID for sequel
                        tmdb_id = sequel.get('id')
                        if not tmdb_id:
                            logger.warning(f"No TMDB ID found for sequel {sequel.get('title', 'Unknown')}")
                            continue

                        try:
                            # Get full details for sequel to get IMDB ID
                            full_details = movie_api.details(tmdb_id)
                            sequel_imdb_id = getattr(full_details, 'imdb_id', None)

                            if not sequel_imdb_id:
                                logger.warning(f"No IMDB ID found for sequel {sequel.get('title', 'Unknown')}")
                                continue

                            # Check if sequel already exists
                            existing_sequel = session.exec(
                                select(Movie).where(Movie.imdb_id == sequel_imdb_id, Movie.user_id == current_user.id, Movie.deleted == False)
                            ).first()
                            if existing_sequel:
                                logger.info(f"Skipping {sequel.get('title')} - Already exists in DB")
                                continue

                            # Construct poster URL for sequel
                            sequel_poster_path = getattr(full_details, 'poster_path', None)
                            sequel_poster_url = None
                            if sequel_poster_path:
                                tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{sequel_poster_path}"
                                sequel_poster_url = save_poster_image(tmdb_poster_url, sequel_imdb_id)
                            if not sequel_poster_url:
                                sequel_poster_url = "/static/no-image.png"

                            # Get collection info for sequel
                            collection = getattr(full_details, 'belongs_to_collection', None)
                            sequel_collection_id = collection.id if collection and hasattr(collection, 'id') else movie.collection_id
                            sequel_collection_name = collection.name if collection and hasattr(collection, 'name') else movie.collection_name

                            sequel_movie = Movie(
                                title=getattr(full_details, 'title', sequel.get('title', 'Unknown')),
                                imdb_id=sequel_imdb_id,
                                release_date=getattr(full_details, 'release_date', sequel.get('release_date')),
                                poster_url=sequel_poster_url,
                                collection_id=sequel_collection_id,
                                collection_name=sequel_collection_name,
                                type="movie",
                                user_id=current_user.id,
                                imported_at=datetime.now(timezone.utc)
                            )
                            session.add(sequel_movie)
                            logger.info(f"Successfully added sequel: {sequel_movie.title} to database")
                        except Exception as e:
                            logger.error(f"Failed to get full details for sequel {sequel.get('title', 'Unknown')}: {e}")

                    logger.info(f"Successfully processed sequels for {movie.title}")
            else:
                logger.info(f"No collection found for {movie.title}, skipping sequel import")
        except Exception as e:
            logger.warning(f"Failed to import sequels for {imdb_id}: {e}")

        # Commit everything (main movie, list items, and sequels)
        session.commit()

        # Capture movie data before session closes
        movie_data = {
            "id": movie.id,
            "title": movie.title,
            "imdb_id": movie.imdb_id
        }

    return {
        "success": True,
        "id": movie_data["id"],
        "title": movie_data["title"],
        "imdb_id": movie_data["imdb_id"],
        "message": f"Movie '{movie_data['title']}' imported successfully"
    }


@router.post("/import/movie/{imdb_id}/sequels")
async def import_movie_with_sequels(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a movie and all its sequels from TMDB (franchise/collection) to specified lists."""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []
    collection_movies = get_collection_movies_by_imdb(imdb_id)
    logger.info(f"IMPORT: Collection movies to process: {[m.get('title') for m in collection_movies]}")
    if not collection_movies:
        logger.info("IMPORT: No franchise/collection found for this movie on TMDB")
        raise HTTPException(status_code=404, detail="No franchise/collection found for this movie on TMDB")

    imported_movies = []
    skipped_movies = []
    collection_id = None
    collection_name = None
    # Get collection info from first movie
    if collection_movies and 'belongs_to_collection' in collection_movies[0] and collection_movies[0]['belongs_to_collection']:
        collection = collection_movies[0]['belongs_to_collection']
        collection_id = collection.get('id')
        collection_name = collection.get('name')
    with Session(engine) as session:
        for movie_data in collection_movies:
            tmdb_id = movie_data.get('id')
            logger.info(f"IMPORT: Processing: {movie_data.get('title')} (TMDB ID: {tmdb_id})")
            # Fetch full details to get IMDB ID
            full_details = movie_api.details(tmdb_id)
            movie_imdb_id = getattr(full_details, 'imdb_id', None)
            if not movie_imdb_id:
                # Fallback: try to fetch IMDB ID using find_api
                logger.debug(f"IMPORT: No IMDB ID in TMDB details for {movie_data.get('title')}, trying find_api fallback...")
                try:
                    find_result = find_api.find(tmdb_id, external_source='tmdb_id')
                    if find_result and 'movie_results' in find_result and find_result['movie_results']:
                        movie_imdb_id = find_result['movie_results'][0].get('imdb_id')
                        logger.debug(f"IMPORT: Fallback IMDB ID for {movie_data.get('title')}: {movie_imdb_id}")
                except Exception as e:
                    logger.warning(f"IMPORT: Fallback find_api failed for {movie_data.get('title')}: {e}")
            if not movie_imdb_id:
                logger.info(f"IMPORT: Skipping {movie_data.get('title')} - No IMDB ID in TMDB details or fallback.")
                skipped_movies.append({"title": movie_data.get('title'), "reason": "No IMDB ID in TMDB details or fallback"})
                continue
            existing = session.exec(select(Movie).where(Movie.imdb_id == movie_imdb_id, Movie.user_id == current_user.id, Movie.deleted == False)).first()
            if existing:
                logger.debug(f"IMPORT: Skipping {movie_data.get('title')} - Already exists in DB")
                skipped_movies.append({"title": movie_data.get('title'), "reason": "Already exists"})
                continue
            # Get collection info for each movie (should be same for all in collection)
            collection = getattr(full_details, 'belongs_to_collection', None)
            cid = collection.id if collection and hasattr(collection, 'id') else collection_id
            cname = collection.name if collection and hasattr(collection, 'name') else collection_name
            poster_url = None
            if full_details and getattr(full_details, 'poster_path', None):
                tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{full_details.poster_path}"
                poster_url = save_poster_image(tmdb_poster_url, movie_imdb_id)
            if not poster_url and movie_data.get('poster_url', '').startswith("http"):
                poster_url = save_poster_image(movie_data['poster_url'], movie_imdb_id)
            if not poster_url:
                poster_url = "/static/no-image.png"
            # Get runtime from TMDB details
            runtime = getattr(full_details, 'runtime', None)

            # Get overview from TMDB details if available
            overview = None
            if hasattr(full_details, 'overview') and full_details.overview:
                overview = full_details.overview

            movie = Movie(
                title=getattr(full_details, 'title', movie_data.get('title')),
                imdb_id=movie_imdb_id,
                release_date=getattr(full_details, 'release_date', movie_data.get('release_date')),
                runtime=runtime,
                watched=False,
                collection_id=cid,
                collection_name=cname,
                poster_url=poster_url,
                poster_thumb=None,
                overview=overview,
                user_id=current_user.id
            )
            session.add(movie)
            imported_movies.append(movie)
            logger.info(f"IMPORT: Imported: {movie.title} ({movie.imdb_id})")

            # Add to specified lists (if any)
            if target_list_ids:
                for list_id in target_list_ids:
                    if list_id != "personal":  # Skip personal list as it's virtual
                        try:
                            target_list = session.exec(
                                select(List).where(
                                    List.id == list_id,
                                    List.user_id == current_user.id,
                                    List.deleted == False
                                )
                            ).first()

                            if target_list:
                                existing_item = session.exec(
                                    select(ListItem).where(
                                        ListItem.list_id == list_id,
                                        ListItem.item_type == "movie",
                                        ListItem.item_id == movie.id,
                                        ListItem.deleted == False
                                    )
                                ).first()

                                if not existing_item:
                                    new_list_item = ListItem(
                                        list_id=list_id,
                                        item_type="movie",
                                        item_id=movie.id,
                                        user_id=current_user.id
                                    )
                                    session.add(new_list_item)
                                    logger.info(f"IMPORT: Added {movie.title} to list {target_list.name}")
                            else:
                                logger.warning(f"IMPORT: List {list_id} not found or no access for user {current_user.username}")
                        except Exception as e:
                            logger.error(f"IMPORT: Failed to add {movie.title} to list {list_id}: {e}")

        session.commit()
        logger.info(f"IMPORT: Total imported: {len(imported_movies)}, Total skipped: {len(skipped_movies)}")
        return {
            "imported_movies": [m.title for m in imported_movies],
            "skipped_movies": skipped_movies,
            "total_imported": len(imported_movies),
            "total_skipped": len(skipped_movies),
            "tmdb_collection_size": len(collection_movies)
        }


@router.post("/admin/fetch-all-sequels")
async def fetch_all_sequels(current_user: User = Depends(get_current_admin_user)):
    """Scan existing movies and import sequels for any known collections/franchises.
    Admin-only so it can be run as a one-shot maintenance task."""
    imported = []
    skipped = []
    errors = []
    processed_ids = set()
    with Session(engine) as session:
        movies = session.exec(select(Movie).where(Movie.user_id == current_user.id, Movie.deleted == False)).all()
        collections = {}
        for m in movies:
            if m.collection_name:
                collections.setdefault(m.collection_name, []).append(m)
        # For each collection, pick earliest release as base and import sequels
        for cname, items in collections.items():
            base = sorted(items, key=lambda x: (x.release_date or '9999-12-31'))[0]
            if base.imdb_id and base.imdb_id not in processed_ids:
                processed_ids.add(base.imdb_id)
                try:
                    # Create a mock request for admin function
                    class MockRequest:
                        async def json(self):
                            return {"target_list_ids": []}

                    res = await import_movie_with_sequels(base.imdb_id, MockRequest(), current_user=current_user)
                    imported.extend(res.get("imported_movies", []))
                    skipped.extend([s.get('title') for s in res.get("skipped_movies", [])])
                except HTTPException as he:
                    if he.status_code == 404:
                        skipped.append(f"{cname}: no collection")
                    else:
                        errors.append(f"{cname}: {he.detail}")
                except Exception as e:
                    errors.append(f"{cname}: {e}")
    return {"imported": imported, "skipped": skipped, "errors": errors}


@router.post("/import/series/{imdb_id}")
async def import_series(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a TV series from IMDB by ID with all episodes to specified lists"""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []
    # Handle both IMDB IDs and TMDB IDs with tmdb_ prefix
    if imdb_id.startswith('tmdb_'):
        # Extract TMDB ID from tmdb_ prefix
        tmdb_id = imdb_id.replace('tmdb_', '')
        # Get series details directly using TMDB ID
        details = get_tv_details_with_imdb(tmdb_id)
        if not details:
            raise HTTPException(status_code=404, detail="Series not found on TMDB")

        # Convert TMDB details to IMDB service format
        episodes = get_all_episodes_by_imdb(imdb_id)  # This will work with tmdb_ prefix
        series_details = type('obj', (object,), {
            'title': details.get('name', f"Series ({imdb_id})"),
            'imdb_id': imdb_id,
            'poster_url': f"https://image.tmdb.org/t/p/w500{details.get('poster_path', '')}" if details.get('poster_path') else None,
            'episodes': [type('obj', (object,), {
                'season': ep['season'],
                'episode': ep['episode'],
                'title': ep['title'],
                'air_date': ep['air_date']
            }) for ep in episodes]
        })
    else:
        # Use IMDB service for real IMDB IDs
        series_details = imdb_service.get_series_details(imdb_id)
        if not series_details:
            raise HTTPException(status_code=404, detail="Series not found on IMDB")

    with Session(engine) as session:
        # Check if series already exists for this user
        existing_series = session.exec(select(Series).where(Series.imdb_id == imdb_id, Series.user_id == current_user.id, Series.deleted == False)).first()

        # If series exists, check if it's already in the target lists
        if existing_series and target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":
                    existing_item = session.exec(
                        select(ListItem).where(
                            ListItem.list_id == list_id,
                            ListItem.item_type == "series",
                            ListItem.item_id == existing_series.id,
                            ListItem.deleted == False
                        )
                    ).first()

                    if existing_item:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Series already exists in list '{list_id}'"
                        )

        # If series doesn't exist, create it
        if not existing_series:
            poster_url = None
            if series_details.poster_url and series_details.poster_url.startswith("http"):
                poster_url = save_poster_image(series_details.poster_url, imdb_id)
            if not poster_url:
                poster_url = "/static/no-image.png"
            # Get average episode runtime from TMDB if available
            average_episode_runtime = None
            if imdb_id.startswith('tmdb_'):
                tmdb_id = imdb_id.replace('tmdb_', '')
                details = get_tv_details_with_imdb(tmdb_id)
                if details and 'episode_run_time' in details and details['episode_run_time']:
                    average_episode_runtime = details['episode_run_time'][0] if details['episode_run_time'] else None

            series = Series(
                title=series_details.title,
                imdb_id=series_details.imdb_id,
                type="series",
                poster_url=poster_url,
                poster_thumb=None,
                average_episode_runtime=average_episode_runtime,
                user_id=current_user.id,
                imported_at=datetime.now(timezone.utc)
            )
            session.add(series)
            session.commit()
            session.refresh(series)

            # Import episodes
            imported_episodes = []
            for episode_data in series_details.episodes:
                episode = Episode(
                    series_id=series.id,
                    season=episode_data.season,
                    episode=episode_data.episode,
                    title=episode_data.title,
                    code=f"S{episode_data.season:02d}E{episode_data.episode:02d}",
                    air_date=episode_data.air_date,
                    watched=False
                )
                session.add(episode)
                imported_episodes.append(episode)

            session.commit()
        else:
            # Series already exists, use it
            series = existing_series
            imported_episodes = []

        # Add to specified lists (if any)
        if target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":
                    try:
                        target_list = session.exec(
                            select(List).where(
                                List.id == list_id,
                                List.user_id == current_user.id,
                                List.deleted == False
                            )
                        ).first()

                        if target_list:
                            existing_item = session.exec(
                                select(ListItem).where(
                                    ListItem.list_id == list_id,
                                    ListItem.item_type == "series",
                                    ListItem.item_id == series.id,
                                    ListItem.deleted == False
                                )
                            ).first()

                            if not existing_item:
                                new_list_item = ListItem(
                                    list_id=list_id,
                                    item_type="series",
                                    item_id=series.id,
                                    user_id=current_user.id
                                )
                                session.add(new_list_item)
                                logger.info(f"Added {series.title} to list {target_list.name}")
                        else:
                            logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                    except Exception as e:
                        logger.error(f"Failed to add {series.title} to list {list_id}: {e}")

            # Commit list items
            session.commit()

        return {
            "series": series,
            "episodes_imported": len(imported_episodes),
            "episodes": imported_episodes
        }


@router.post("/import/series/{imdb_id}/full")
async def import_full_series(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a TV series with ALL seasons and episodes from IMDB to specified lists"""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []
    # Handle both IMDB IDs and TMDB IDs with tmdb_ prefix
    if imdb_id.startswith('tmdb_'):
        # Extract TMDB ID from tmdb_ prefix
        tmdb_id = imdb_id.replace('tmdb_', '')
        # Get series details directly using TMDB ID
        details = get_tv_details_with_imdb(tmdb_id)
    else:
        # Try TMDB first - convert IMDB ID to TMDB ID
        tmdb_series = get_tmdb_series_by_imdb(imdb_id)
        details = tmdb_series

    if details and details.get('name'):
        title = details['name']
    elif details and details.get('title'):
        title = details['title']
    else:
        title = None

    if title:
        poster_url = details.get('poster_path')
        if poster_url:
            poster_url = f"https://image.tmdb.org/t/p/w500{poster_url}"
        episodes = get_all_episodes_by_imdb(imdb_id)
        num_episodes = len(episodes)
        num_seasons = len(set(ep['season'] for ep in episodes)) if episodes else 0
        # Insert into Series table
        with Session(engine) as session:
            db_series = Series(title=title, imdb_id=imdb_id, type="series", user_id=current_user.id, imported_at=datetime.now(timezone.utc))
            session.add(db_series)
            session.commit()
            session.refresh(db_series)
            for ep in episodes:
                db_episode = Episode(
                    series_id=db_series.id,
                    season=ep['season'],
                    episode=ep['episode'],
                    title=ep['title'],
                    code=f"S{ep['season']:02d}E{ep['episode']:02d}",
                    air_date=ep['air_date'],
                    watched=False
                )
                session.add(db_episode)
            session.commit()

            # Add to specified lists (if any)
            if target_list_ids:
                for list_id in target_list_ids:
                    if list_id != "personal":  # Skip personal list as it's virtual
                        try:
                            target_list = session.exec(
                                select(List).where(
                                    List.id == list_id,
                                    List.user_id == current_user.id,
                                    List.deleted == False
                                )
                            ).first()

                            if target_list:
                                existing_item = session.exec(
                                    select(ListItem).where(
                                        ListItem.list_id == list_id,
                                        ListItem.item_type == "series",
                                        ListItem.item_id == db_series.id,
                                        ListItem.deleted == False
                                    )
                                ).first()

                                if not existing_item:
                                    new_list_item = ListItem(
                                        list_id=list_id,
                                        item_type="series",
                                        item_id=db_series.id,
                                        user_id=current_user.id
                                    )
                                    session.add(new_list_item)
                                    logger.info(f"Added {db_series.title} to list {target_list.name}")
                            else:
                                logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                        except Exception as e:
                            logger.error(f"Failed to add {db_series.title} to list {list_id}: {e}")

                session.commit()

        return {"success": True, "source": "tmdb", "num_episodes": num_episodes, "num_seasons": num_seasons}

    # If TMDB fails, try TVMaze
    tvmaze_data = get_series_from_tvmaze_by_imdb(imdb_id)
    if tvmaze_data:
        title = tvmaze_data.get('title', f"Series ({imdb_id})")
        poster_url = tvmaze_data.get('poster_url')
        with Session(engine) as session:
            db_series = Series(title=title, imdb_id=imdb_id, type="series", user_id=current_user.id, imported_at=datetime.now(timezone.utc))
            session.add(db_series)
            session.commit()
            session.refresh(db_series)
            episodes = get_all_episodes_by_imdb(imdb_id)
            num_episodes = len(episodes)
            num_seasons = len(set(ep['season'] for ep in episodes)) if episodes else 0
            for ep in episodes:
                db_episode = Episode(
                    series_id=db_series.id,
                    season=ep['season'],
                    episode=ep['episode'],
                    title=ep['title'],
                    code=f"S{ep['season']:02d}E{ep['episode']:02d}",
                    air_date=ep['air_date'],
                    watched=False
                )
                session.add(db_episode)
            session.commit()

            # Add to specified lists (if any)
            if target_list_ids:
                for list_id in target_list_ids:
                    if list_id != "personal":
                        try:
                            target_list = session.exec(
                                select(List).where(
                                    List.id == list_id,
                                    List.user_id == current_user.id,
                                    List.deleted == False
                                )
                            ).first()

                            if target_list:
                                existing_item = session.exec(
                                    select(ListItem).where(
                                        ListItem.list_id == list_id,
                                        ListItem.item_type == "series",
                                        ListItem.item_id == db_series.id,
                                        ListItem.deleted == False
                                    )
                                ).first()

                                if not existing_item:
                                    new_list_item = ListItem(
                                        list_id=list_id,
                                        item_type="series",
                                        item_id=db_series.id,
                                        user_id=current_user.id
                                    )
                                    session.add(new_list_item)
                                    logger.info(f"Added {db_series.title} to list {target_list.name}")
                            else:
                                logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                        except Exception as e:
                            logger.error(f"Failed to add {db_series.title} to list {list_id}: {e}")

                session.commit()

        return {"success": True, "source": "tvmaze", "num_episodes": num_episodes, "num_seasons": num_seasons}

    # If both fail, fallback to mock
    return {"success": True, "source": "mock", "num_episodes": 0, "num_seasons": 0}


@router.post("/import/by_url/")
async def import_by_url(request: Request):
    """Import a movie or series by IMDB or TVMaze URL (auto-detects type)."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON in request body.")
    if not data or 'url' not in data:
        raise HTTPException(status_code=400, detail="Missing 'url' in request body.")
    url = data['url'].strip()
    if url.startswith('@'):
        url = url[1:].strip()
    logger.debug(f"Import by URL: {url}")
    extracted_imdb_id = extract_imdb_id_from_url(url)
    if not extracted_imdb_id:
        # Try TVMaze URL
        extracted_imdb_id = get_imdb_id_from_tvmaze_url(url)
    if not extracted_imdb_id:
        raise HTTPException(status_code=400, detail="Could not extract IMDB ID from URL.")
    logger.debug(f"Extracted IMDB ID: {extracted_imdb_id}")
    tmdb_result = find_api.find(extracted_imdb_id, external_source='imdb_id')
    logger.debug(f"TMDB find result for {extracted_imdb_id}: movie_results={len(tmdb_result.get('movie_results', []))}, tv_results={len(tmdb_result.get('tv_results', []))}")
    if tmdb_result.get('movie_results'):
        # Import as movie
        return import_movie(extracted_imdb_id)
    elif tmdb_result.get('tv_results'):
        # Import as series
        return import_series(extracted_imdb_id)
    else:
        raise HTTPException(status_code=404, detail="IMDB ID not found as movie or series in TMDB.")


@router.post("/import/url")
@router.post("/import/url/")
async def import_by_url_alias(request: Request):
    return await import_by_url(request)


@router.post("/share/import")
def share_import(request: Request):
    """Endpoint for mobile/web sharing: accepts a URL, imports full series or movie+sequels automatically."""
    data = request.json() if hasattr(request, 'json') else None
    if not data or 'url' not in data:
        raise HTTPException(status_code=400, detail="Missing 'url' in request body.")
    url = data['url']
    logger.debug(f"Share import by URL: {url}")
    extracted_imdb_id = extract_imdb_id_from_url(url)
    if not extracted_imdb_id:
        extracted_imdb_id = get_imdb_id_from_tvmaze_url(url)
    if not extracted_imdb_id:
        raise HTTPException(status_code=400, detail="Could not extract IMDB ID from URL.")
    logger.debug(f"Extracted IMDB ID: {extracted_imdb_id}")
    tmdb_result = find_api.find(extracted_imdb_id, external_source='imdb_id')
    logger.debug(f"TMDB find result for {extracted_imdb_id}")
    if tmdb_result.get('movie_results'):
        # Import movie with sequels
        try:
            result = import_movie_with_sequels(extracted_imdb_id)
            return {"success": True, "type": "movie", "imdb_id": extracted_imdb_id, "result": result}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to import movie with sequels: {e}")
    elif tmdb_result.get('tv_results'):
        # Import full series
        try:
            from routers.imports import import_series as _import_series
            result = _import_series(extracted_imdb_id)
            return {"success": True, "type": "series", "imdb_id": extracted_imdb_id, "result": result}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to import full series: {e}")
    else:
        raise HTTPException(status_code=404, detail="IMDB ID not found as movie or series in TMDB.")
