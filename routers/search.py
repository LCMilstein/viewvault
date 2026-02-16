"""
Search endpoints for ViewVault.

Provides movie, series, and unified search via TMDB and TVMaze.
"""

import logging
import os
import requests
from fastapi import APIRouter, HTTPException, Request
from deps import limiter
from tmdb_service import movie_api, tv_api, get_tv_details_with_imdb

logger = logging.getLogger(__name__)

router = APIRouter()

TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"


# --- TVMaze fallback helper ---
def search_series_tvmaze(query: str):
    url = f"https://api.tvmaze.com/search/shows?q={requests.utils.quote(query)}"
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for item in data:
            show = item.get('show', {})
            externals = show.get('externals', {})
            imdb_id = externals.get('imdb')
            if not imdb_id:
                continue
            results.append({
                "title": show.get('name'),
                "imdb_id": imdb_id,
                "poster_url": show.get('image', {}).get('medium') or show.get('image', {}).get('original'),
                "episodes": []
            })
        return results
    except Exception as e:
        logger.error(f"TVMaze search failed: {e}")
        return []


@router.get("/search/movies/")
@limiter.limit("30/minute")
def search_movies(request: Request, query: str):
    logger.debug(f"/search/movies/ endpoint called with query: {query}")
    try:
        tmdb_results = movie_api.search(query)
        logger.debug(f"Raw TMDB movie search results count: {len(tmdb_results) if tmdb_results else 0}")
        movies = []
        for m in tmdb_results:
            logger.debug(f"Processing movie result: {getattr(m, 'title', 'unknown')}")
            if not hasattr(m, 'id'):
                logger.debug(f"Skipping result (no id): {getattr(m, 'title', 'unknown')}")
                continue
            imdb_id = getattr(m, 'imdb_id', None)
            if not imdb_id:
                try:
                    details = movie_api.details(m.id)
                    imdb_id = getattr(details, 'imdb_id', None)
                    logger.debug(f"Fetched details for movie id {m.id}: imdb_id={imdb_id}")
                except Exception as e:
                    logger.debug(f"Failed to fetch details for movie id {m.id}: {e}")
                    continue
            if not imdb_id:
                logger.debug(f"Skipping movie (no imdb_id): {getattr(m, 'title', 'unknown')}")
                continue
            # Robust poster URL
            poster_path = getattr(m, 'poster_path', None)
            poster_url = f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else "/static/no-image.png"
            movies.append({
                "title": getattr(m, 'title', None) or "Untitled",
                "imdb_id": imdb_id,
                "release_date": getattr(m, 'release_date', None) or "",
                "poster_url": poster_url
            })
        logger.debug(f"Final movie results count: {len(movies)}")
        return movies
    except Exception as e:
        import traceback
        logger.error(f"Movie search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Movie search failed: {str(e)}")


@router.get("/search/series/")
@limiter.limit("30/minute")
def search_series(request: Request, query: str):
    logger.debug(f"/search/series/ endpoint called with query: {query}")
    try:
        tmdb_results = tv_api.search(query)
        logger.debug(f"Raw TMDB series search results count: {len(tmdb_results) if tmdb_results else 0}")
        series = []
        for s in tmdb_results:
            logger.debug(f"Processing series result: {getattr(s, 'name', 'unknown')}")
            if not hasattr(s, 'id'):
                logger.debug(f"Skipping result (no id): {getattr(s, 'name', 'unknown')}")
                continue
            try:
                details = get_tv_details_with_imdb(s.id)
                imdb_id = details.get('imdb_id') if details else None
                logger.debug(f"Fetched details for series id {getattr(s, 'id', None)}: imdb_id={imdb_id}")
            except Exception as e:
                logger.debug(f"Failed to fetch details for series id {getattr(s, 'id', None)}: {e}")
                continue
            if not imdb_id:
                logger.debug(f"Skipping series (no imdb_id): {getattr(s, 'name', 'unknown')}")
                continue
            poster_path = getattr(s, 'poster_path', None)
            poster_url = f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else "/static/no-image.png"
            series.append({
                "title": getattr(s, 'name', None) or "Untitled",
                "imdb_id": imdb_id,
                "poster_url": poster_url,
                "episodes": []
            })
        logger.debug(f"Final TMDB series results count: {len(series)}")
        # If no importable results, try TVMaze
        if not series:
            logger.debug("No importable TMDB series found, trying TVMaze fallback...")
            tvmaze_results = search_series_tvmaze(query)
            logger.debug(f"TVMaze fallback results count: {len(tvmaze_results)}")
            # Ensure TVMaze fallback also has all fields
            for item in tvmaze_results:
                item["title"] = item.get("title") or "Untitled"
                item["imdb_id"] = item.get("imdb_id") or ""
                item["poster_url"] = item.get("poster_url") or "/static/no-image.png"
                item["episodes"] = item.get("episodes") or []
            series.extend(tvmaze_results)
        return series
    except Exception as e:
        import traceback
        logger.error(f"Series search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Series search failed: {str(e)}")


@router.get("/search/series/tvmaze/")
def search_series_tvmaze_endpoint(query: str):
    """Search for series via TVMaze API."""
    return search_series_tvmaze(query)


@router.get("/search/all/")
def search_all(query: str):
    """Unified search for both movies and TV series using TMDB."""
    logger.debug(f"search_all function called with query: '{query}'")
    # Search movies
    movie_results = movie_api.search(query)
    logger.debug(f"TMDB movie search results for '{query}': {len(movie_results) if movie_results else 0} results")
    movies = []
    for m in movie_results:
        if not hasattr(m, 'id'):
            logger.debug(f"Skipping movie result (no id)")
            continue
        imdb_id = getattr(m, 'imdb_id', None)
        if not imdb_id:
            details = movie_api.details(m.id)
            imdb_id = getattr(details, 'imdb_id', None)
            logger.debug(f"Fetched details for movie id {m.id}: imdb_id={imdb_id}")
        if not imdb_id:
            logger.debug(f"Skipping movie '{getattr(m, 'title', None)}' (TMDB id {m.id}) - no IMDB ID")
            continue
        poster_path = getattr(m, 'poster_path', None)
        poster_url = f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else "/static/no-image.png"
        movies.append({
            "title": getattr(m, 'title', None),
            "imdb_id": imdb_id,
            "release_date": getattr(m, 'release_date', None),
            "poster_url": poster_url,
            "type": "movie"
        })
        logger.debug(f"Included movie: {getattr(m, 'title', None)} (IMDB {imdb_id})")

    # Search TV series
    try:
        logger.debug(f"Starting TV series search for '{query}'")
        series_results = tv_api.search(query)
        logger.debug(f"TMDB series search results for '{query}': {len(series_results) if series_results else 0} results")
        series = []
        found_series_ids = set()
        normalized_query = query.strip().lower()

        if not series_results:
            logger.debug(f"No series results found for '{query}'")
        else:
            for s in series_results:
                if not hasattr(s, 'id'):
                    logger.debug(f"Skipping series result (no id)")
                    continue
                logger.debug(f"Processing series: id={getattr(s, 'id', None)}, name={getattr(s, 'name', None)}")
                found_series_ids.add(getattr(s, 'id', None))
                details = get_tv_details_with_imdb(s.id)
                logger.debug(f"TMDB TV details for id {s.id} retrieved")
                imdb_id = details.get('imdb_id') if details else None
                logger.debug(f"Fetched details for series id {s.id}: imdb_id={imdb_id}")
                if not imdb_id:
                    logger.debug(f"Series '{getattr(s, 'name', None)}' (TMDB id {s.id}) has no IMDB ID from TMDB, but including it anyway")
                    # For series without IMDB ID, we'll still include them but mark them as not importable
                    imdb_id = f"tmdb_{s.id}"  # Use TMDB ID as a fallback
                poster_path = getattr(s, 'poster_path', None)
                poster_url = f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else "/static/no-image.png"
                series.append({
                    "title": getattr(s, 'name', None),
                    "imdb_id": imdb_id,
                    "release_date": getattr(s, 'first_air_date', None),
                    "poster_url": poster_url,
                    "type": "series"
                })
                logger.debug(f"Included series: {getattr(s, 'name', None)} (IMDB {imdb_id})")
    except Exception as e:
        logger.error(f"Error during TV series search: {e}")
        series = []
    # Enhanced fallback: if we have few or no series results, try a broader search
    if len(series) < 2:  # If we have less than 2 series results
        logger.debug(f"Limited series results for '{query}', trying broader search...")
        # Use TMDB API directly to search for the series by name
        api_key = os.environ.get("TMDB_API_KEY")
        url = f"https://api.themoviedb.org/3/search/tv?api_key={api_key}&query={requests.utils.quote(query)}"
        resp = requests.get(url)
        if resp.status_code == 200:
            data = resp.json()
            logger.debug(f"Direct TMDB search/tv response for '{query}': {len(data.get('results', []))} results")
            results = data.get('results', [])
            for result in results:
                name = result.get('name', '').strip().lower()
                result_id = result.get('id')

                # More lenient matching - check if query words are in the title
                query_words = normalized_query.split()
                name_words = name.split()

                # Check if any query word is in the title
                has_match = any(word in name for word in query_words if len(word) > 2)

                if has_match and result_id not in found_series_ids:
                    logger.debug(f"Found broader match for '{query}' with id {result_id}, fetching details...")
                    details = get_tv_details_with_imdb(result_id)
                    logger.debug(f"Direct fetch TMDB TV details for id {result_id} retrieved")
                    imdb_id = details.get('imdb_id') if details else None
                    if imdb_id:
                        poster_path = details.get('poster_path')
                        poster_url = f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else "/static/no-image.png"
                        series.append({
                            "title": details.get('name'),
                            "imdb_id": imdb_id,
                            "release_date": details.get('first_air_date'),
                            "poster_url": poster_url,
                            "type": "series"
                        })
                        logger.debug(f"Included broader series: {details.get('name')} (IMDB {imdb_id})")
                    else:
                        logger.debug(f"Broader fetch for '{query}' did not yield an IMDB ID.")
        else:
            logger.error(f"TMDB API error for search/tv '{query}': {resp.status_code}")

    # Combine and sort results by relevance
    all_results = movies + series

    # Score results by relevance (exact title match gets highest score)
    def score_result(result, query):
        title = result.get('title', '').lower()
        query_lower = query.lower()

        # Exact title match gets highest score
        if title == query_lower:
            return 100
        # Title starts with query
        elif title.startswith(query_lower):
            return 95
        # Title contains query
        elif query_lower in title:
            return 85
        # Partial word match (most words match)
        elif any(word in title for word in query_lower.split()):
            return 75
        # Series get slight bonus over movies for exact matches
        elif result.get('type') == 'series' and query_lower in title:
            return 80
        # Default score for other matches
        else:
            return 50

    # Filter results based on relevance to the query
    def filter_results(results, query):
        query_lower = query.lower()
        query_words = query_lower.split()

        # Filter out results that are clearly irrelevant
        filtered = []
        for result in results:
            title = result.get('title', '').lower()

            # Keep results that contain the full query
            if query_lower in title:
                filtered.append(result)
                continue

            # Keep results that contain most query words
            title_words = title.split()
            matching_words = sum(1 for word in query_words if word in title_words)
            if matching_words >= len(query_words) * 0.7:  # 70% word match
                filtered.append(result)
                continue

            # Keep results that start with the query
            if title.startswith(query_lower):
                filtered.append(result)
                continue

        # If filtering removed everything, return original results
        return filtered if filtered else results

    # Filter and sort results
    filtered_results = filter_results(all_results, query)
    sorted_results = sorted(filtered_results, key=lambda x: score_result(x, query), reverse=True)

    # Limit to top 12 results (6 movies + 6 series max)
    limited_results = sorted_results[:12]

    logger.debug(f"Final sorted results count (limited to 12): {len(limited_results)}")
    return limited_results
