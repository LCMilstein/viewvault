"""
Watchlist endpoints for ViewVault.

Includes stats, watchlist retrieval, toggle watched, remove items, and clear.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, text
from database import engine
from models import Movie, Series, Episode, User, ListItem
from deps import get_current_user
from tmdb_service import get_collection_details_by_tmdb_id, get_tmdb_series_by_imdb, get_season_posters

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/stats/")
def get_stats(current_user: User = Depends(get_current_user)):
    with Session(engine) as session:
        total_movies = session.exec(select(Movie).where(Movie.deleted == False, Movie.user_id == current_user.id)).all()
        total_series = session.exec(select(Series).where(Series.deleted == False, Series.user_id == current_user.id)).all()
        total_episodes = session.exec(select(Episode).where(Episode.deleted == False)).all()

        watched_movies = [m for m in total_movies if m.watched]
        watched_episodes = [e for e in total_episodes if e.watched]

        return {
            "movies": {
                "total": len(total_movies),
                "watched": len(watched_movies),
                "unwatched": len(total_movies) - len(watched_movies)
            },
            "series": {
                "total": len(total_series)
            },
            "episodes": {
                "total": len(total_episodes),
                "watched": len(watched_episodes),
                "unwatched": len(total_episodes) - len(watched_episodes)
            }
        }


@router.get("/stats")
def get_stats_alias(current_user: User = Depends(get_current_user)):
    return get_stats(current_user)


@router.get("/watchlist")
@router.get("/watchlist/")
def get_watchlist(current_user: User = Depends(get_current_user)):
    """
    Returns all movies (standalone and grouped), collections, and series (with episodes) in the watchlist.
    """
    logger.info(f"WATCHLIST ENDPOINT: Called for user: {current_user.username} (ID: {current_user.id})")
    logger.info(f"WATCHLIST ENDPOINT: User auth_provider: {getattr(current_user, 'auth_provider', 'unknown')}")
    logger.info(f"WATCHLIST ENDPOINT: User is_active: {current_user.is_active}")
    logger.info(f"WATCHLIST ENDPOINT: User auth0_user_id: {getattr(current_user, 'auth0_user_id', 'None')}")
    logger.info(f"WATCHLIST ENDPOINT: User is_admin: {getattr(current_user, 'is_admin', False)}")

    # Additional validation for Auth0 users
    if hasattr(current_user, 'auth_provider') and current_user.auth_provider == 'auth0':
        if not getattr(current_user, 'auth0_user_id', None):
            logger.error("WATCHLIST ENDPOINT: Auth0 user missing auth0_user_id")
            raise HTTPException(status_code=401, detail="Invalid user configuration")

    try:
        with Session(engine) as session:
            logger.debug("WATCHLIST ENDPOINT: Database session created successfully")
            logger.debug(f"WATCHLIST ENDPOINT: Querying movies for user_id: {current_user.id}")

            # --- Movies ---
            # Check if is_new column exists in the database
            try:
                # Get all movies owned by user, but exclude those that are in custom lists
                # First, get IDs of movies that are in custom lists
                movies_in_custom_lists = session.exec(
                    select(ListItem.item_id).where(
                        ListItem.item_type == "movie",
                        ListItem.deleted == False
                    )
                ).all()

                # Now get movies that belong to user but are NOT in any custom list
                # (these are the personal watchlist movies)
                query = select(Movie).where(
                    Movie.user_id == current_user.id,
                    Movie.deleted == False
                )

                # Exclude movies that are in custom lists
                if movies_in_custom_lists:
                    query = query.where(Movie.id.not_in(movies_in_custom_lists))

                movies = session.exec(query).all()
                logger.info(f"WATCHLIST ENDPOINT: Found {len(movies)} movies for user {current_user.id}")
                if movies:
                    logger.info(f"WATCHLIST ENDPOINT: Sample movie IDs: {[m.id for m in movies[:5]]}")
            except Exception as e:
                if "no such column: movie.is_new" in str(e):
                    # If is_new column doesn't exist, select without it but with user_id filter
                    # Also exclude movies that are in custom lists
                    # Get movies in custom lists
                    movies_in_custom_lists_result = session.exec(text(
                        "SELECT item_id FROM listitem WHERE item_type = 'movie' AND deleted = 0"
                    )).all()
                    movies_in_custom_lists = [row[0] for row in movies_in_custom_lists_result]

                    # Build query to exclude custom list movies
                    if movies_in_custom_lists:
                        movies_in_custom_str = ','.join(map(str, movies_in_custom_lists))
                        query_text = f"SELECT id, title, imdb_id, release_date, watched, type, collection_id, collection_name, poster_url, poster_thumb FROM movie WHERE user_id = :user_id AND deleted = 0 AND id NOT IN ({movies_in_custom_str})"
                    else:
                        query_text = "SELECT id, title, imdb_id, release_date, watched, type, collection_id, collection_name, poster_url, poster_thumb FROM movie WHERE user_id = :user_id AND deleted = 0"

                    result = session.exec(text(query_text), {"user_id": current_user.id})
                    movies = []
                    for row in result:
                        # Create a simple object with the available attributes
                        movie = type('Movie', (), {
                            'id': row[0],
                            'title': row[1],
                            'imdb_id': row[2],
                            'release_date': row[3],
                            'watched': row[4],
                            'type': row[5],
                            'collection_id': row[6],
                            'collection_name': row[7],
                            'poster_url': row[8],
                            'poster_thumb': row[9]
                        })()
                        movies.append(movie)
                else:
                    raise e
            # Group movies by collection_id
            collections = {}
            standalone_movies = []
            for m in movies:
                try:
                    poster_url = m.poster_url or "/static/no-image.png"
                    movie_data = {
                        "id": m.id,
                        "title": m.title,
                        "imdb_id": m.imdb_id,
                        "release_date": m.release_date,
                        "watched": m.watched,
                        "collection_id": m.collection_id,
                        "collection_name": m.collection_name,
                        "poster_url": poster_url,
                        "added_at": getattr(m, 'added_at', None),  # Use actual added_at timestamp from database
                        "imported_at": getattr(m, 'imported_at', None),  # Add imported_at for "Newly Imported" badges
                        "is_new": getattr(m, 'is_new', False),  # Handle missing column gracefully
                        "quality": getattr(m, 'quality', None),  # Jellyfin quality info
                        "runtime": getattr(m, 'runtime', None),  # Add runtime field
                        "overview": getattr(m, 'overview', None)  # Movie description from TMDB
                    }
                    if m.collection_id and m.collection_name:
                        if m.collection_id not in collections:
                            # Get collection description from TMDB
                            collection_details = get_collection_details_by_tmdb_id(m.collection_id)
                            collection_overview = collection_details.get('overview') if collection_details else None

                            collections[m.collection_id] = {
                                "id": m.collection_id,
                                "title": m.collection_name,
                                "poster_url": poster_url,  # Use first movie's poster
                                "overview": collection_overview,  # Collection description from TMDB
                                "items": [],
                                "is_new": getattr(m, 'is_new', False)  # Handle missing column gracefully
                            }
                        collections[m.collection_id]["items"].append(movie_data)
                    else:
                        standalone_movies.append(movie_data)
                except Exception as e:
                    logger.error(f"Error processing movie {m.id}: {e}")
                    continue

            # --- Series ---
            # Check if is_new column exists in the database for series
            try:
                # Get all series owned by user, but exclude those that are in custom lists
                # First, get IDs of series that are in custom lists
                series_in_custom_lists = session.exec(
                    select(ListItem.item_id).where(
                        ListItem.item_type == "series",
                        ListItem.deleted == False
                    )
                ).all()

                # Now get series that belong to user but are NOT in any custom list
                # (these are the personal watchlist series)
                query = select(Series).where(
                    Series.user_id == current_user.id,
                    Series.deleted == False
                )

                # Exclude series that are in custom lists
                if series_in_custom_lists:
                    query = query.where(Series.id.not_in(series_in_custom_lists))

                series_list = session.exec(query).all()
            except Exception as e:
                if "no such column: series.is_new" in str(e):
                    # If is_new column doesn't exist, select without it but with user_id filter
                    # Also exclude series that are in custom lists
                    # Get series in custom lists
                    series_in_custom_lists_result = session.exec(text(
                        "SELECT item_id FROM listitem WHERE item_type = 'series' AND deleted = 0"
                    )).all()
                    series_in_custom_lists = [row[0] for row in series_in_custom_lists_result]

                    # Build query to exclude custom list series
                    if series_in_custom_lists:
                        series_in_custom_str = ','.join(map(str, series_in_custom_lists))
                        query_text = f"SELECT id, title, imdb_id, poster_url, average_episode_runtime FROM series WHERE user_id = :user_id AND deleted = 0 AND id NOT IN ({series_in_custom_str})"
                    else:
                        query_text = "SELECT id, title, imdb_id, poster_url, average_episode_runtime FROM series WHERE user_id = :user_id AND deleted = 0"

                    result = session.exec(text(query_text), {"user_id": current_user.id})
                    series_list = []
                    for row in result:
                        # Create a simple object with the available attributes
                        series = type('Series', (), {
                            'id': row[0],
                            'title': row[1],
                            'imdb_id': row[2],
                            'poster_url': row[3],
                            'average_episode_runtime': row[4],
                            'imported_at': None  # Fallback for missing column
                        })()
                        series_list.append(series)
                else:
                    raise e
            series_data = []
            for s in series_list:
                try:
                    poster_url = s.poster_url or "/static/no-image.png"
                    # Get episodes for this series
                    episodes = session.exec(select(Episode).where(Episode.series_id == s.id, Episode.deleted == False)).all()
                    episodes_data = [
                        {
                            "id": ep.id,
                            "series_id": ep.series_id,
                            "season_number": ep.season,
                            "episode_number": ep.episode,
                            "title": ep.title,
                            "code": ep.code,
                            "air_date": ep.air_date,
                            "watched": ep.watched
                        }
                        for ep in episodes
                    ]
                    # Series is considered watched if all episodes are watched (or if no episodes, False)
                    watched = all(ep.watched for ep in episodes) if episodes else False
                    # Get season posters if we have a TMDB ID
                    season_posters = {}
                    logger.debug(f"Getting season posters for series {s.id} with IMDB ID: {s.imdb_id}")
                    if s.imdb_id:
                        try:
                            tmdb_id = None

                            if s.imdb_id.startswith('tmdb_'):
                                # Extract TMDB ID from tmdb_ prefix
                                tmdb_id = s.imdb_id.replace('tmdb_', '')
                                logger.debug(f"Using TMDB ID directly: {tmdb_id}")
                            else:
                                # Convert IMDB ID to TMDB ID if needed
                                tmdb_series = get_tmdb_series_by_imdb(s.imdb_id)
                                logger.debug(f"TMDB series found for {s.imdb_id}")
                                if tmdb_series and 'id' in tmdb_series:
                                    tmdb_id = tmdb_series['id']

                            if tmdb_id:
                                season_posters = get_season_posters(int(tmdb_id))
                                logger.debug(f"Season posters retrieved for series {s.id}: {len(season_posters)} seasons")
                            else:
                                logger.debug(f"No TMDB ID found for series {s.id}")
                        except Exception as e:
                            logger.error(f"Error getting season posters for series {s.id}: {e}")
                    else:
                        logger.debug(f"Skipping season posters for series {s.id} - no IMDB ID")

                    series_data.append({
                        "id": s.id,
                        "title": s.title,
                        "imdb_id": s.imdb_id,
                        "poster_url": poster_url,
                        "watched": watched,
                        "episodes": episodes_data,
                        "season_posters": season_posters,  # Add season poster URLs
                        "is_new": getattr(s, 'is_new', False),  # Handle missing column gracefully
                        "imported_at": getattr(s, 'imported_at', None),  # Add imported_at for "Newly Imported" badges
                        "average_episode_runtime": getattr(s, 'average_episode_runtime', None)  # Add average episode runtime field
                    })
                except Exception as e:
                    logger.error(f"Error processing series {s.id}: {e}")
                    continue

            # --- Collections as list ---
            collections_list = list(collections.values())

            # Sort items within each collection by release date
            for collection in collections_list:
                collection["items"].sort(key=lambda x: x.get("release_date", "") if x.get("release_date") else "9999-12-31")

            return {
                "collections": collections_list,
                "series": series_data,
                "movies": standalone_movies
            }
    except HTTPException:
        # Re-raise HTTP exceptions (like 401 Unauthorized)
        raise
    except Exception as e:
        logger.error(f"WATCHLIST ENDPOINT: Unexpected error: {e}")
        logger.error(f"WATCHLIST ENDPOINT: Error type: {type(e).__name__}")
        import traceback
        logger.error(f"WATCHLIST ENDPOINT: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to load watchlist: {str(e)}")


@router.post("/watchlist/movie/{movie_id}/toggle")
def toggle_movie_watched(movie_id: int, current_user: User = Depends(get_current_user)):
    """Toggle watched status for a movie"""
    with Session(engine) as session:
        movie = session.exec(select(Movie).where(Movie.id == movie_id, Movie.user_id == current_user.id, Movie.deleted == False)).first()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        movie.watched = not movie.watched
        session.commit()
        session.refresh(movie)
        return {"message": "Movie watched status updated", "watched": movie.watched}


@router.post("/watchlist/series/{series_id}/toggle")
def toggle_series_watched(series_id: int, current_user: User = Depends(get_current_user)):
    """Toggle watched status for a series (marks all episodes as watched/unwatched)"""
    with Session(engine) as session:
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id, Series.deleted == False)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")

        # Get all episodes for this series
        episodes = session.exec(select(Episode).where(Episode.series_id == series_id, Episode.deleted == False)).all()

        # Toggle all episodes to the opposite of the first episode's status
        # If no episodes or all unwatched, mark all as watched
        # If any watched, mark all as unwatched
        should_mark_watched = not any(ep.watched for ep in episodes)

        for episode in episodes:
            episode.watched = should_mark_watched

        session.commit()
        return {"message": "Series watched status updated", "watched": should_mark_watched}


@router.post("/watchlist/collection/{collection_id}/toggle")
def toggle_collection_watched(collection_id: str, current_user: User = Depends(get_current_user)):
    """Toggle watched status for all movies in a collection"""
    with Session(engine) as session:
        # Get all movies in this collection for this user
        movies = session.exec(select(Movie).where(Movie.collection_id == collection_id, Movie.user_id == current_user.id, Movie.deleted == False)).all()

        if not movies:
            raise HTTPException(status_code=404, detail="Collection not found")

        # Toggle all movies to the opposite of the first movie's status
        # If no movies or all unwatched, mark all as watched
        # If any watched, mark all as unwatched
        should_mark_watched = not any(m.watched for m in movies)

        for movie in movies:
            movie.watched = should_mark_watched

        session.commit()
        return {"message": "Collection watched status updated", "watched": should_mark_watched}


@router.post("/series/{series_id}/episodes/{season}/{episode}/toggle")
def toggle_episode_watched(series_id: int, season: int, episode: int, current_user: User = Depends(get_current_user)):
    """Toggle watched status for a specific episode"""
    with Session(engine) as session:
        # First verify the series belongs to this user
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id, Series.deleted == False)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")

        episode_obj = session.exec(
            select(Episode).where(
                Episode.series_id == series_id,
                Episode.season == season,
                Episode.episode == episode,
                Episode.deleted == False
            )
        ).first()

        if not episode_obj:
            raise HTTPException(status_code=404, detail="Episode not found")

        episode_obj.watched = not episode_obj.watched
        session.commit()
        session.refresh(episode_obj)
        return {"message": "Episode watched status updated", "watched": episode_obj.watched}


@router.delete("/watchlist/movie/{movie_id}")
def remove_movie_from_watchlist(movie_id: int, current_user: User = Depends(get_current_user)):
    """Remove a movie from the watchlist"""
    with Session(engine) as session:
        movie = session.exec(select(Movie).where(Movie.id == movie_id, Movie.user_id == current_user.id, Movie.deleted == False)).first()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        session.delete(movie)
        session.commit()
        return {"message": "Movie removed from watchlist"}


@router.post("/movies/{movie_id}/clear-newly-imported")
def clear_movie_newly_imported(movie_id: int, current_user: User = Depends(get_current_user)):
    """Clear the newly imported status for a movie"""
    with Session(engine) as session:
        movie = session.exec(select(Movie).where(Movie.id == movie_id, Movie.user_id == current_user.id, Movie.deleted == False)).first()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        movie.imported_at = None
        session.add(movie)
        session.commit()
        return {"message": "Newly imported status cleared"}


@router.post("/series/{series_id}/clear-newly-imported")
def clear_series_newly_imported(series_id: int, current_user: User = Depends(get_current_user)):
    """Clear the newly imported status for a series"""
    with Session(engine) as session:
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id, Series.deleted == False)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")

        series.imported_at = None
        session.add(series)
        session.commit()
        return {"message": "Newly imported status cleared"}


@router.delete("/watchlist/series/{series_id}")
def remove_series_from_watchlist(series_id: int, current_user: User = Depends(get_current_user)):
    """Remove a series and all its episodes from the watchlist"""
    with Session(engine) as session:
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id, Series.deleted == False)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")

        # Delete all episodes first
        episodes = session.exec(select(Episode).where(Episode.series_id == series_id, Episode.deleted == False)).all()
        for episode in episodes:
            session.delete(episode)

        # Delete the series
        session.delete(series)
        session.commit()
        return {"message": "Series and all episodes removed from watchlist"}


@router.delete("/watchlist/clear")
def clear_all_watchlist(current_user: User = Depends(get_current_user)):
    """Clear all data from the watchlist for the current user"""
    with Session(engine) as session:
        # Delete all episodes for this user's series
        user_series_ids = [s.id for s in session.exec(select(Series).where(Series.user_id == current_user.id)).all()]
        episodes = session.exec(select(Episode).where(Episode.series_id.in_(user_series_ids))).all()
        for episode in episodes:
            session.delete(episode)

        # Delete all series for this user
        series = session.exec(select(Series).where(Series.user_id == current_user.id)).all()
        for s in series:
            session.delete(s)

        # Delete all movies for this user
        movies = session.exec(select(Movie).where(Movie.user_id == current_user.id)).all()
        for movie in movies:
            session.delete(movie)

        session.commit()
        return {"message": "All watchlist data cleared"}


@router.post("/watchlist/{item_type}/{item_id}/interacted")
def mark_as_interacted(item_type: str, item_id: int, current_user: User = Depends(get_current_user)):
    """Mark an item as interacted (removes 'new' status)"""
    with Session(engine) as session:
        if item_type == "movie":
            item = session.exec(select(Movie).where(Movie.id == item_id, Movie.user_id == current_user.id, Movie.deleted == False)).first()
        elif item_type == "series":
            item = session.exec(select(Series).where(Series.id == item_id, Series.user_id == current_user.id, Series.deleted == False)).first()
        elif item_type == "collection":
            # For collections, mark all movies in the collection as interacted
            movies = session.exec(select(Movie).where(Movie.collection_id == item_id, Movie.user_id == current_user.id, Movie.deleted == False)).all()
            for movie in movies:
                movie.is_new = False
            session.commit()
            return {"message": f"Collection {item_id} marked as interacted"}
        else:
            raise HTTPException(status_code=400, detail="Invalid item type")

        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        item.is_new = False
        session.commit()
        session.refresh(item)
        return {"message": f"{item_type} {item_id} marked as interacted"}


@router.get("/watchlist/unwatched/")
def get_unwatched_watchlist(sort_by: str = Query("added", enum=["added", "watched", "release_date"]), current_user: User = Depends(get_current_user)):
    """
    Returns all unwatched movies and all series with their unwatched episodes, grouped by series.
    Supports sorting by 'added', 'watched', or 'release_date'.
    """
    with Session(engine) as session:
        # Unwatched movies for this user
        movies = session.exec(select(Movie).where(Movie.watched == False, Movie.user_id == current_user.id, Movie.deleted == False)).all()
        # Sorting
        if sort_by == "release_date":
            movies.sort(key=lambda m: (m.release_date or ""))
        elif sort_by == "watched":
            movies.sort(key=lambda m: (m.watched, m.id))
        else:  # added (by added_at timestamp)
            movies.sort(key=lambda m: (m.added_at or ""))
        # Unwatched episodes grouped by series for this user
        user_series_ids = [s.id for s in session.exec(select(Series).where(Series.user_id == current_user.id, Series.deleted == False)).all()]
        episodes = session.exec(select(Episode).where(Episode.watched == False, Episode.series_id.in_(user_series_ids), Episode.deleted == False)).all()
        series_map = {}
        for ep in episodes:
            if ep.series_id not in series_map:
                s = session.get(Series, ep.series_id)
                if not s or s.deleted:
                    continue
                series_map[ep.series_id] = {
                    "id": s.id,
                    "title": s.title,
                    "imdb_id": s.imdb_id,
                    "episodes": []
                }
            series_map[ep.series_id]["episodes"].append({
                "id": ep.id,
                "season": ep.season,
                "episode": ep.episode,
                "title": ep.title,
                "code": ep.code,
                "air_date": ep.air_date,
                "watched": ep.watched
            })
        # Sorting episodes in each series
        for s in series_map.values():
            if sort_by == "release_date":
                s["episodes"].sort(key=lambda e: (e["air_date"] or ""))
            elif sort_by == "watched":
                s["episodes"].sort(key=lambda e: (e["watched"], e["id"]))
            else:  # added (by added_at timestamp)
                s["episodes"].sort(key=lambda e: (e["air_date"] or ""))
        # Sort series by id (added), or by title
        series_list = list(series_map.values())
        if sort_by == "release_date":
            series_list.sort(key=lambda s: (s["episodes"][0]["air_date"] if s["episodes"] else ""))
        else:  # added (by added_at timestamp)
            series_list.sort(key=lambda s: (s["episodes"][0]["air_date"] if s["episodes"] else ""))
        return {
            "movies": [{
                "id": m.id,
                "title": m.title,
                "imdb_id": m.imdb_id,
                "release_date": m.release_date,
                "watched": m.watched,
                "collection_id": m.collection_id,
                "collection_name": m.collection_name,
                "added_at": getattr(m, 'added_at', None)  # Include added_at for proper sorting
            } for m in movies],
            "series": series_list
        }
