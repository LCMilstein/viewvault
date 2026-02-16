import logging
import requests
import re
from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import datetime
import asyncio
import aiohttp

logger = logging.getLogger(__name__)

@dataclass
class IMDBMovie:
    title: str
    imdb_id: str
    release_date: Optional[str] = None
    plot: Optional[str] = None
    rating: Optional[float] = None
    poster_url: Optional[str] = None

@dataclass
class IMDBEpisode:
    title: str
    season: int
    episode: int
    air_date: Optional[str] = None
    plot: Optional[str] = None
    rating: Optional[float] = None

@dataclass
class IMDBSeries:
    title: str
    imdb_id: str
    plot: Optional[str] = None
    rating: Optional[float] = None
    poster_url: Optional[str] = None
    episodes: List[IMDBEpisode] = None

class IMDBService:
    def __init__(self, api_key: str = None):
        # For now, we'll use a free approach with OMDB API
        # You can get a free API key from http://www.omdbapi.com/
        self.api_key = api_key
        self.base_url = "http://www.omdbapi.com/"
        
    def search_movies(self, query: str) -> List[IMDBMovie]:
        """Search for movies by title"""
        params = {
            's': query,
            'type': 'movie',
            'apikey': self.api_key
        }
        
        try:
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if data.get('Response') == 'True':
                movies = []
                for item in data.get('Search', []):
                    movie = IMDBMovie(
                        title=item.get('Title', ''),
                        imdb_id=item.get('imdbID', ''),
                        release_date=item.get('Year', ''),
                        poster_url=item.get('Poster', '')
                    )
                    movies.append(movie)
                return movies
            else:
                return []
                
        except Exception as e:
            logger.error(f"Error searching movies: {e}")
            return []
    
    def search_series(self, query: str) -> List[IMDBSeries]:
        """Search for TV series by title"""
        params = {
            's': query,
            'type': 'series',
            'apikey': self.api_key
        }
        
        try:
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if data.get('Response') == 'True':
                series = []
                for item in data.get('Search', []):
                    series_item = IMDBSeries(
                        title=item.get('Title', ''),
                        imdb_id=item.get('imdbID', ''),
                        poster_url=item.get('Poster', ''),
                        episodes=[]
                    )
                    series.append(series_item)
                return series
            else:
                return []
                
        except Exception as e:
            logger.error(f"Error searching series: {e}")
            return []
    
    def get_movie_details(self, imdb_id: str) -> Optional[IMDBMovie]:
        """Get detailed information about a movie"""
        params = {
            'i': imdb_id,
            'apikey': self.api_key
        }
        
        try:
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if data.get('Response') == 'True':
                return IMDBMovie(
                    title=data.get('Title', ''),
                    imdb_id=data.get('imdbID', ''),
                    release_date=data.get('Year', ''),
                    plot=data.get('Plot', ''),
                    rating=float(data.get('imdbRating', 0)) if data.get('imdbRating') != 'N/A' else None,
                    poster_url=data.get('Poster', '')
                )
            return None
            
        except Exception as e:
            logger.error(f"Error getting movie details: {e}")
            return None
    
    def get_series_details(self, imdb_id: str) -> Optional[IMDBSeries]:
        """Get detailed information about a TV series"""
        params = {
            'i': imdb_id,
            'apikey': self.api_key
        }
        
        try:
            response = requests.get(self.base_url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if data.get('Response') == 'True':
                series = IMDBSeries(
                    title=data.get('Title', ''),
                    imdb_id=data.get('imdbID', ''),
                    plot=data.get('Plot', ''),
                    rating=float(data.get('imdbRating', 0)) if data.get('imdbRating') != 'N/A' else None,
                    poster_url=data.get('Poster', ''),
                    episodes=[]
                )
                
                # Get episodes if available
                total_seasons = data.get('totalSeasons')
                if total_seasons and total_seasons != 'N/A':
                    series.episodes = self._get_series_episodes(imdb_id, int(total_seasons))
                
                return series
            return None
            
        except Exception as e:
            logger.error(f"Error getting series details: {e}")
            return None
    
    async def _get_series_episodes_async(self, imdb_id: str, total_seasons: int) -> List[IMDBEpisode]:
        """Get all episodes for a series using concurrent requests for better performance."""
        episodes = []
        
        # Note: OMDB API has limitations for episode data
        # For a production app, you might want to use a different API like TMDB
        # or implement web scraping for more comprehensive episode data
        
        # Limit to 20 seasons for practical use
        seasons_to_fetch = list(range(1, min(total_seasons + 1, 21)))
        
        if not seasons_to_fetch:
            return episodes
        
        # Fetch all seasons concurrently
        episodes = await self._fetch_seasons_concurrently(imdb_id, seasons_to_fetch)
        return episodes
    
    async def _fetch_seasons_concurrently(self, imdb_id: str, season_numbers: List[int]) -> List[IMDBEpisode]:
        """Fetch multiple seasons concurrently using aiohttp."""
        episodes = []
        
        async def fetch_season(session: aiohttp.ClientSession, season: int) -> List[IMDBEpisode]:
            """Fetch a single season's episodes."""
            params = {
                'i': imdb_id,
                'Season': season,
                'apikey': self.api_key
            }
            
            try:
                async with session.get(self.base_url, params=params) as resp:
                    if resp.status != 200:
                        logger.error(f"Error getting episodes for season {season}: HTTP {resp.status}")
                        return []
                    
                    data = await resp.json()
                    season_episodes = []
                    
                    if data.get('Response') == 'True':
                        for episode_data in data.get('Episodes', []):
                            episode = IMDBEpisode(
                                title=episode_data.get('Title', ''),
                                season=season,
                                episode=int(episode_data.get('Episode', 0)),
                                air_date=episode_data.get('Released', ''),
                                rating=float(episode_data.get('imdbRating', 0)) if episode_data.get('imdbRating') != 'N/A' else None
                            )
                            season_episodes.append(episode)
                    
                    return season_episodes
                    
            except Exception as e:
                logger.error(f"Error getting episodes for season {season}: {e}")
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

    def _get_series_episodes(self, imdb_id: str, total_seasons: int) -> List[IMDBEpisode]:
        """Get all episodes for a series (this is a simplified version)"""
        # Use the async version with asyncio.run for backward compatibility
        try:
            return asyncio.run(self._get_series_episodes_async(imdb_id, total_seasons))
        except Exception as e:
            logger.warning(f"Error in async episode fetch, falling back to sync: {e}")
            # Fallback to the original synchronous implementation
            return self._get_series_episodes_sync(imdb_id, total_seasons)
    
    def _get_series_episodes_sync(self, imdb_id: str, total_seasons: int) -> List[IMDBEpisode]:
        """Original synchronous implementation as fallback."""
        episodes = []
        
        # Note: OMDB API has limitations for episode data
        # For a production app, you might want to use a different API like TMDB
        # or implement web scraping for more comprehensive episode data
        
        for season in range(1, min(total_seasons + 1, 21)):  # Limit to 20 seasons for practical use
            params = {
                'i': imdb_id,
                'Season': season,
                'apikey': self.api_key
            }
            
            try:
                response = requests.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                if data.get('Response') == 'True':
                    for episode_data in data.get('Episodes', []):
                        episode = IMDBEpisode(
                            title=episode_data.get('Title', ''),
                            season=season,
                            episode=int(episode_data.get('Episode', 0)),
                            air_date=episode_data.get('Released', ''),
                            rating=float(episode_data.get('imdbRating', 0)) if episode_data.get('imdbRating') != 'N/A' else None
                        )
                        episodes.append(episode)
                        
            except Exception as e:
                logger.error(f"Error getting episodes for season {season}: {e}")
                continue

        return episodes

# For development/testing without API key
class MockIMDBService:
    """Mock service for development when no API key is available"""
    
    def __init__(self):
        self.mock_counter = 1000  # Start counter for unique IDs
    
    def _get_next_mock_id(self):
        """Generate a unique mock IMDB ID"""
        self.mock_counter += 1
        return f"tt{self.mock_counter}"
    
    def search_movies(self, query: str) -> List[IMDBMovie]:
        # Generate unique mock data based on the query
        mock_id = self._get_next_mock_id()
        return [
            IMDBMovie(
                title=f"Mock Movie: {query}",
                imdb_id=mock_id,
                release_date="2023",
                plot=f"A mock movie for testing purposes - {query}",
                rating=7.5,
                poster_url="https://via.placeholder.com/300x450"
            )
        ]
    
    def search_series(self, query: str) -> List[IMDBSeries]:
        mock_id = self._get_next_mock_id()
        return [
            IMDBSeries(
                title=f"Mock Series: {query}",
                imdb_id=mock_id,
                plot=f"A mock series for testing purposes - {query}",
                rating=8.0,
                poster_url="https://via.placeholder.com/300x450",
                episodes=[
                    IMDBEpisode(title="Pilot", season=1, episode=1, air_date="2023-01-01"),
                    IMDBEpisode(title="Episode 2", season=1, episode=2, air_date="2023-01-08"),
                ]
            )
        ]
    
    def get_movie_details(self, imdb_id: str) -> Optional[IMDBMovie]:
        return IMDBMovie(
            title=f"Mock Movie Details ({imdb_id})",
            imdb_id=imdb_id,
            release_date="2023",
            plot=f"Detailed mock movie information for {imdb_id}",
            rating=7.5,
            poster_url="https://via.placeholder.com/300x450"
        )
    
    def get_series_details(self, imdb_id: str) -> Optional[IMDBSeries]:
        return IMDBSeries(
            title=f"Mock Series Details ({imdb_id})",
            imdb_id=imdb_id,
            plot=f"Detailed mock series information for {imdb_id}",
            rating=8.0,
            poster_url="https://via.placeholder.com/300x450",
            episodes=[
                IMDBEpisode(title="Pilot", season=1, episode=1, air_date="2023-01-01"),
                IMDBEpisode(title="Episode 2", season=1, episode=2, air_date="2023-01-08"),
            ]
        ) 