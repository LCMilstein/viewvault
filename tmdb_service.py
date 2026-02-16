import os
import requests
import logging
from tmdbv3api import TMDb, Movie, TV, Collection, Find
from typing import List, Dict, Optional
import asyncio
import aiohttp
from dataclasses import asdict

logger = logging.getLogger(__name__)

# Initialize TMDb
_tmdb = TMDb()
_tmdb.api_key = os.environ.get("TMDB_API_KEY")
_tmdb.language = "en"
_tmdb.debug = False

movie_api = Movie()
tv_api = TV()
collection_api = Collection()
find_api = Find()

def asdict_safe(obj):
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, '__dict__'):
        return dict(obj.__dict__)
    # Try to extract known fields
    result = {}
    for attr in dir(obj):
        if not attr.startswith('_') and not callable(getattr(obj, attr)):
            try:
                result[attr] = getattr(obj, attr)
            except Exception:
                pass
    return result if result else None


def get_tmdb_movie_by_imdb(imdb_id: str) -> Optional[dict]:
    """Get TMDB movie details by IMDB ID."""
    logger.debug(f"Looking up IMDB ID: {imdb_id}")
    results = find_api.find(imdb_id, external_source='imdb_id')
    logger.debug(f"Find results: {results}")
    if results and 'movie_results' in results and results['movie_results']:
        tmdb_id = results['movie_results'][0]['id']
        logger.debug(f"Found TMDB ID: {tmdb_id}")
        details = movie_api.details(tmdb_id)
        logger.debug(f"Raw TMDB details type: {type(details)}")
        details_dict = asdict_safe(details)
        logger.debug(f"Converted details keys: {list(details_dict.keys()) if details_dict else 'None'}")
        logger.debug(f"Poster path in details: {details_dict.get('poster_path') if details_dict else 'N/A'}")
        return details_dict
    logger.debug(f"No movie results found for IMDB ID: {imdb_id}")
    return None


def get_tmdb_series_by_imdb(imdb_id: str) -> Optional[dict]:
    """Get TMDB TV series details by IMDB ID."""
    results = find_api.find(imdb_id, external_source='imdb_id')
    if results and 'tv_results' in results and results['tv_results']:
        tmdb_id = results['tv_results'][0]['id']
        details = tv_api.details(tmdb_id)
        details_dict = asdict_safe(details)
        return details_dict
    return None

def get_collection_movies_by_tmdb_id(collection_id: int) -> List[dict]:
    """Get all movies in a TMDB collection/franchise by collection ID."""
    logger.debug(f"Fetching TMDB collection with ID: {collection_id}")
    collection = collection_api.details(collection_id)
    logger.debug(f"Raw TMDB collection response (type: {type(collection)}): {repr(collection)}")
    parts = getattr(collection, 'parts', None)
    if parts is not None:
        logger.debug(f"Collection parts: {parts}")
        # Sort movies by release date (earliest first)
        sorted_parts = sorted(parts, key=lambda x: x.get('release_date', '') if x.get('release_date') else '9999-12-31')
        logger.debug(f"Sorted collection parts by release date: {sorted_parts}")

        # Fetch full details for each movie to get IMDB IDs
        detailed_movies = []
        for part in sorted_parts:
            try:
                tmdb_id = part.get('id')
                if tmdb_id:
                    logger.debug(f"Fetching details for TMDB ID: {tmdb_id}")
                    movie_details = movie_api.details(tmdb_id)
                    movie_dict = asdict_safe(movie_details)
                    if movie_dict:
                        detailed_movies.append(movie_dict)
                        logger.debug(f"Added movie: {movie_dict.get('title')} with IMDB ID: {movie_dict.get('imdb_id')}")
                    else:
                        logger.warning(f"Failed to convert movie details to dict for TMDB ID: {tmdb_id}")
                else:
                    logger.warning(f"No TMDB ID found in part: {part}")
            except Exception as e:
                logger.error(f"Error fetching details for part {part}: {e}")
                continue

        logger.debug(f"Returning {len(detailed_movies)} detailed movies")
        return detailed_movies
    logger.debug("No parts found in collection.")
    return []

def get_collection_details_by_tmdb_id(collection_id: int) -> Optional[dict]:
    """Get TMDB collection details including overview/description."""
    try:
        logger.debug(f"Fetching TMDB collection details for ID: {collection_id}")
        collection = collection_api.details(collection_id)
        collection_dict = asdict_safe(collection)
        logger.debug(f"Collection details: {collection_dict}")
        return collection_dict
    except Exception as e:
        logger.error(f"Error fetching collection details: {e}")
        return None


def get_collection_movies_by_imdb(imdb_id: str) -> List[dict]:
    """Get all movies in a franchise by IMDB ID (auto-maps to TMDB, then gets collection)."""
    tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
    logger.debug(f"TMDB movie for IMDB ID {imdb_id}: {tmdb_movie}")
    if not tmdb_movie:
        logger.debug(f"No TMDB movie found for IMDB ID {imdb_id}")
        return []
    collection = tmdb_movie.get('belongs_to_collection')
    logger.debug(f"Collection for movie: {collection}")
    if collection and 'id' in collection:
        movies = get_collection_movies_by_tmdb_id(collection['id'])
        logger.debug(f"Movies in collection: {movies}")
        return movies
    logger.debug("No collection found, returning just the movie itself.")
    return [tmdb_movie]  # If not part of a collection, just return the movie itself

async def get_all_episodes_by_imdb_async(imdb_id: str) -> List[dict]:
    """Get all episodes for a TV series by IMDB ID using concurrent requests for better performance."""
    # Handle both IMDB IDs and TMDB IDs with tmdb_ prefix
    if imdb_id.startswith('tmdb_'):
        # Extract TMDB ID directly
        tmdb_id = imdb_id.replace('tmdb_', '')
        # Get series details directly using TMDB ID
        details = get_tv_details_with_imdb(tmdb_id)
        if not details:
            return []
    else:
        # Use IMDB ID to find TMDB series
        tmdb_series = get_tmdb_series_by_imdb(imdb_id)
        if not tmdb_series:
            return []
        tmdb_id = tmdb_series['id']
        details = get_tv_details_with_imdb(tmdb_id)
        if not details:
            return []
    
    details = tv_api.details(tmdb_id)
    details_dict = asdict_safe(details) or {}
    
    # Get all seasons that need to be fetched
    seasons_to_fetch = []
    for season in details_dict.get('seasons', []):
        season_number = season.get('season_number') if isinstance(season, dict) else getattr(season, 'season_number', None)
        # Skip season 0 (specials, webisodes, etc.)
        if season_number == 0:
            logger.debug(f"Skipping season 0 (specials/webisodes) for TMDB series {tmdb_id}")
            continue
        seasons_to_fetch.append(season_number)

    if not seasons_to_fetch:
        return []
    
    # Fetch all seasons concurrently
    episodes = await fetch_seasons_concurrently(tmdb_id, seasons_to_fetch)
    return episodes

def get_season_posters(tmdb_id: int) -> dict:
    """Get season poster URLs for a TV series."""
    try:
        details = tv_api.details(tmdb_id)
        details_dict = asdict_safe(details) or {}
        
        season_posters = {}
        for season in details_dict.get('seasons', []):
            season_number = season.get('season_number') if isinstance(season, dict) else getattr(season, 'season_number', None)
            poster_path = season.get('poster_path') if isinstance(season, dict) else getattr(season, 'poster_path', None)
            
            if season_number is not None and poster_path:
                season_posters[season_number] = f"https://image.tmdb.org/t/p/w500{poster_path}"
        
        return season_posters
    except Exception as e:
        logger.error(f"Error getting season posters for TMDB series {tmdb_id}: {e}")
        return {}

async def fetch_seasons_concurrently(tmdb_id: int, season_numbers: List[int]) -> List[dict]:
    """Fetch multiple seasons concurrently using aiohttp."""
    api_key = os.environ.get("TMDB_API_KEY")
    episodes = []
    
    async def fetch_season(session: aiohttp.ClientSession, season_number: int) -> List[dict]:
        """Fetch a single season's episodes."""
        url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}?api_key={api_key}&language=en-US"
        
        try:
            async with session.get(url) as resp:
                if resp.status != 200:
                    logger.warning(f"Failed to fetch season {season_number} for TMDB series {tmdb_id}: {resp.status}")
                    return []
                
                season_data = await resp.json()
                season_episodes = []
                
                for ep in season_data.get('episodes', []):
                    episode_val = ep.get('episode_number')
                    title_val = ep.get('name')
                    air_date_val = ep.get('air_date')
                    overview_val = ep.get('overview')
                    ep_id_val = ep.get('id')
                    
                    # Only include episodes with valid season and episode numbers
                    if season_number is None or episode_val is None:
                        logger.debug(f"Skipping episode with missing season/episode number: {ep}")
                        continue

                    season_episodes.append({
                        'season': season_number,
                        'episode': episode_val,
                        'title': title_val if title_val else f"Episode {episode_val}",
                        'air_date': air_date_val if air_date_val else '',
                        'overview': overview_val if overview_val else '',
                        'id': ep_id_val
                    })
                
                return season_episodes
                
        except Exception as e:
            logger.error(f"Error fetching season {season_number}: {e}")
            return []

    # Create aiohttp session and fetch all seasons concurrently
    async with aiohttp.ClientSession() as session:
        # Create tasks for all seasons
        tasks = [fetch_season(session, season_num) for season_num in season_numbers]
        
        # Execute all tasks concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Combine all episode results
        for result in results:
            if isinstance(result, list):
                episodes.extend(result)
            else:
                logger.error(f"Error in concurrent fetch: {result}")

    return episodes

def get_all_episodes_by_imdb(imdb_id: str) -> List[dict]:
    """Get all episodes for a TV series by IMDB ID (auto-maps to TMDB, then fetches all seasons/episodes)."""
    # Use the async version with asyncio.run for backward compatibility
    try:
        return asyncio.run(get_all_episodes_by_imdb_async(imdb_id))
    except Exception as e:
        logger.warning(f"Error in async episode fetch, falling back to sync: {e}")
        # Fallback to the original synchronous implementation
        return get_all_episodes_by_imdb_sync(imdb_id)

def get_all_episodes_by_imdb_sync(imdb_id: str) -> List[dict]:
    """Original synchronous implementation as fallback."""
    # Handle both IMDB IDs and TMDB IDs with tmdb_ prefix
    if imdb_id.startswith('tmdb_'):
        # Extract TMDB ID directly
        tmdb_id = imdb_id.replace('tmdb_', '')
        # Get series details directly using TMDB ID
        details = get_tv_details_with_imdb(tmdb_id)
        if not details:
            return []
    else:
        # Use IMDB ID to find TMDB series
        tmdb_series = get_tmdb_series_by_imdb(imdb_id)
        if not tmdb_series:
            return []
        tmdb_id = tmdb_series['id']
        details = get_tv_details_with_imdb(tmdb_id)
        if not details:
            return []
    details = tv_api.details(tmdb_id)
    details_dict = asdict_safe(details) or {}
    episodes = []
    api_key = os.environ.get("TMDB_API_KEY")
    for season in details_dict.get('seasons', []):
        season_number = season.get('season_number') if isinstance(season, dict) else getattr(season, 'season_number', None)
        # Skip season 0 (specials, webisodes, etc.)
        if season_number == 0:
            logger.debug(f"Skipping season 0 (specials/webisodes) for TMDB series {tmdb_id}")
            continue
        # Use direct TMDB API call for season details
        url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}?api_key={api_key}&language=en-US"
        resp = requests.get(url)
        if resp.status_code != 200:
            logger.warning(f"Failed to fetch season {season_number} for TMDB series {tmdb_id}: {resp.status_code}")
            continue
        season_details = resp.json()
        for ep in season_details.get('episodes', []):
            episode_val = ep.get('episode_number')
            title_val = ep.get('name')
            air_date_val = ep.get('air_date')
            overview_val = ep.get('overview')
            ep_id_val = ep.get('id')
            # Only include episodes with valid season and episode numbers
            if season_number is None or episode_val is None:
                logger.debug(f"Skipping episode with missing season/episode number: {ep}")
                continue
            episodes.append({
                'season': season_number,
                'episode': episode_val,
                'title': title_val if title_val else f"Episode {episode_val}",
                'air_date': air_date_val if air_date_val else '',
                'overview': overview_val if overview_val else '',
                'id': ep_id_val
            })
    return episodes

def get_tv_details_with_imdb(tmdb_id):
    """Fetch TV series details directly from TMDB API, including imdb_id."""
    api_key = os.environ.get("TMDB_API_KEY")
    url = f"https://api.themoviedb.org/3/tv/{tmdb_id}?api_key={api_key}"
    resp = requests.get(url)
    if resp.status_code == 200:
        data = resp.json()
        logger.debug(f"Raw TMDB TV details for id {tmdb_id}: {data}")
        return data
    logger.warning(f"TMDB API error for TV id {tmdb_id}: {resp.status_code} {resp.text}")
    return None

def get_episode_details(tmdb_id, season_number, episode_number):
    """Fetch episode details from TMDB API."""
    api_key = os.environ.get("TMDB_API_KEY")
    url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{season_number}/episode/{episode_number}?api_key={api_key}"
    resp = requests.get(url)
    if resp.status_code == 200:
        data = resp.json()
        logger.debug(f"TMDB episode details for {tmdb_id} S{season_number}E{episode_number}: {data}")
        return data
    logger.warning(f"TMDB API error for episode {tmdb_id} S{season_number}E{episode_number}: {resp.status_code} {resp.text}")
    return None 