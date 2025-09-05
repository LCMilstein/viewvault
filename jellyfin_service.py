#!/usr/bin/env python3
"""
Jellyfin Service
Handles API calls to Jellyfin server to retrieve movie information
"""

import os
import requests
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

class JellyfinService:
    def __init__(self, server_url: str, api_key: str, user_id: str = None):
        """
        Initialize Jellyfin service
        
        Args:
            server_url: Jellyfin server URL (e.g., http://192.168.1.100:8096)
            api_key: Jellyfin API key
            user_id: Optional user ID for user-specific queries
        """
        self.server_url = server_url.rstrip('/')
        self.api_key = api_key
        self.user_id = user_id
        self.session = requests.Session()
        self.session.headers.update({
            'X-Emby-Token': api_key,
            'Content-Type': 'application/json'
        })
        # Set timeout for requests
        self.session.timeout = 30
        
    def test_connection(self) -> bool:
        """Test if we can connect to Jellyfin server"""
        try:
            logger.info(f"Testing connection to: {self.server_url}/System/Info")
            response = self.session.get(f"{self.server_url}/System/Info")
            logger.info(f"Connection response status: {response.status_code}")
            logger.info(f"Response headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                logger.error(f"Jellyfin server returned status {response.status_code}")
                try:
                    error_content = response.text
                    logger.error(f"Error response content: {error_content[:500]}")
                except:
                    pass
                return False
            
            # Try to parse the response to make sure it's valid
            try:
                data = response.json()
                logger.info(f"Jellyfin server info: {data.get('ServerName', 'Unknown')} - Version: {data.get('Version', 'Unknown')}")
                return True
            except Exception as parse_error:
                logger.error(f"Failed to parse Jellyfin response: {parse_error}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to connect to Jellyfin: {e}")
            logger.error(f"Exception type: {type(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return False
    
    def get_users(self) -> List[Dict[str, Any]]:
        """Get list of users from Jellyfin"""
        try:
            response = self.session.get(f"{self.server_url}/Users")
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to get users: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error getting users: {e}")
            return []
    
    def get_libraries(self) -> List[Dict[str, Any]]:
        """Get list of available libraries from Jellyfin"""
        try:
            # First try to get users to find a valid user ID if none provided
            if not self.user_id:
                users_response = self.session.get(f"{self.server_url}/Users")
                if users_response.status_code == 200:
                    users = users_response.json()
                    if users:
                        self.user_id = users[0].get('Id')  # Use first user
                        logger.info(f"Using user ID: {self.user_id}")
                    else:
                        logger.error("No users found in Jellyfin")
                        return []
                else:
                    logger.error(f"Failed to get users: {users_response.status_code}")
                    return []
            
            # Now get libraries for the user
            response = self.session.get(f"{self.server_url}/Users/{self.user_id}/Views")
            if response.status_code == 200:
                data = response.json()
                libraries = []
                for item in data.get('Items', []):
                    collection_type = item.get('CollectionType')
                    name = item.get('Name')
                    logger.info(f"Found library: '{name}' with type: '{collection_type}'")
                    
                    # Include ALL libraries for now to see what's available
                    # We'll filter by content later if needed
                    if True:  # Include all libraries
                        libraries.append({
                            'id': item.get('Id'),
                            'name': name,
                            'type': collection_type
                        })
                        logger.info(f"✅ Added library: '{name}' (type: {collection_type})")
                    else:
                        logger.info(f"❌ Skipped library: '{name}' (type: {collection_type}) - not movies/mixed")
                logger.info(f"Found {len(libraries)} movie/mixed libraries: {[lib['name'] for lib in libraries]}")
                return libraries
            else:
                logger.error(f"Failed to get libraries: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error getting libraries: {e}")
            return []

    def get_movies(self, user_id: str = None, library_ids: List[str] = None) -> List[Dict[str, Any]]:
        """
        Get movies from Jellyfin library
        
        Args:
            user_id: Optional user ID for user-specific library
            library_ids: List of library IDs to filter by (if None, gets all movie libraries)
            
        Returns:
            List of movie dictionaries with metadata
        """
        try:
            logger.info("Fetching movies from Jellyfin...")
            
            # If no specific libraries provided, get all movie libraries
            if library_ids is None:
                libraries = self.get_libraries()
                library_ids = [lib['id'] for lib in libraries]
                logger.info(f"Found {len(library_ids)} movie libraries")
            
            all_movies = []
            
            for library_id in library_ids:
                logger.info(f"Fetching movies from library {library_id}")
                
                # Get items from specific library
                params = {
                    'IncludeItemTypes': 'Movie',
                    'Recursive': 'true',
                    'Fields': 'MediaSources,MediaStreams,BasicSyncInfo,ProviderIds',
                    'ImageTypeLimit': '0',  # Don't include images to reduce payload
                    'ParentId': library_id
                }
                
                if user_id:
                    params['UserId'] = user_id
                    
                response = self.session.get(f"{self.server_url}/Items", params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    for item in data.get('Items', []):
                        movie_info = self._extract_movie_info(item)
                        if movie_info:
                            all_movies.append(movie_info)
                else:
                    logger.error(f"Failed to get movies from library {library_id}: {response.status_code}")
            
            logger.info(f"Retrieved {len(all_movies)} movies from Jellyfin")
            return all_movies
                
        except Exception as e:
            logger.error(f"Error getting movies: {e}")
            return []
    
    def _extract_movie_info(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Extract relevant movie information from Jellyfin item
        
        Args:
            item: Jellyfin item dictionary
            
        Returns:
            Dictionary with movie info including quality assessment
        """
        try:
            # Basic movie info
            movie_info = {
                'id': item.get('Id'),
                'name': item.get('Name'),
                'year': item.get('ProductionYear'),
                'imdb_id': None,
                'tmdb_id': None,
                'quality': 'Unknown',
                'file_size': 0,
                'resolution': None
            }
            
            # Extract external IDs
            provider_ids = item.get('ProviderIds', {})
            movie_info['imdb_id'] = provider_ids.get('Imdb')
            movie_info['tmdb_id'] = provider_ids.get('Tmdb')
            
            # Debug: log the provider IDs to see what's available
            if provider_ids:
                logger.debug(f"Provider IDs for {item.get('Name')}: {provider_ids}")
            
            # Get media sources for quality assessment
            media_sources = item.get('MediaSources', [])
            if media_sources:
                # Use the first media source (usually the main file)
                media_source = media_sources[0]
                movie_info['file_size'] = media_source.get('Size', 0)
                
                # Get video streams for resolution info
                media_streams = media_source.get('MediaStreams', [])
                video_streams = [s for s in media_streams if s.get('Type') == 'Video']
                
                if video_streams:
                    video_stream = video_streams[0]
                    width = video_stream.get('Width', 0)
                    height = video_stream.get('Height', 0)
                    movie_info['resolution'] = f"{width}x{height}"
                    
                    # Determine quality based on resolution
                    if width >= 3840 or height >= 2160:
                        movie_info['quality'] = '4K'
                    elif width >= 1920 or height >= 1080:
                        movie_info['quality'] = 'HD'
                    elif width >= 720 or height >= 480:
                        movie_info['quality'] = 'SD'
                    else:
                        movie_info['quality'] = 'Unknown'
                
                # Fallback to file size if no resolution info
                if movie_info['quality'] == 'Unknown' and movie_info['file_size'] > 0:
                    # Rough estimates based on file size
                    size_gb = movie_info['file_size'] / (1024**3)
                    if size_gb > 20:
                        movie_info['quality'] = '4K'
                    elif size_gb > 8:
                        movie_info['quality'] = 'HD'
                    elif size_gb > 1:
                        movie_info['quality'] = 'SD'
                    else:
                        movie_info['quality'] = 'Unknown'
            
            # Only return if we have at least a name
            if movie_info['name']:
                return movie_info
            else:
                return None
                
        except Exception as e:
            logger.error(f"Error extracting movie info: {e}")
            return None
    
    def get_movie_by_imdb(self, imdb_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific movie by IMDB ID
        
        Args:
            imdb_id: IMDB ID to search for
            
        Returns:
            Movie info if found, None otherwise
        """
        try:
            params = {
                'IncludeItemTypes': 'Movie',
                'Recursive': 'true',
                'SearchTerm': imdb_id,
                'Fields': 'MediaSources,MediaStreams,BasicSyncInfo'
            }
            
            response = self.session.get(f"{self.server_url}/Items", params=params)
            
            if response.status_code == 200:
                data = response.json()
                items = data.get('Items', [])
                
                for item in items:
                    provider_ids = item.get('ProviderIds', {})
                    if provider_ids.get('Imdb') == imdb_id:
                        return self._extract_movie_info(item)
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting movie by IMDB ID {imdb_id}: {e}")
            return None


class MockJellyfinService:
    """Mock service for testing without Jellyfin server"""
    
    def __init__(self):
        self.mock_movies = [
            {
                'id': 'mock-1',
                'name': 'The Matrix',
                'year': 1999,
                'imdb_id': 'tt0133093',
                'tmdb_id': '603',
                'quality': 'HD',
                'file_size': 8589934592,  # 8GB
                'resolution': '1920x1080'
            },
            {
                'id': 'mock-2', 
                'name': 'Inception',
                'year': 2010,
                'imdb_id': 'tt1375666',
                'tmdb_id': '27205',
                'quality': '4K',
                'file_size': 32212254720,  # 30GB
                'resolution': '3840x2160'
            }
        ]
    
    def test_connection(self) -> bool:
        return True
    
    def get_users(self) -> List[Dict[str, Any]]:
        return [{'Id': 'mock-user', 'Name': 'Mock User'}]
    
    def get_libraries(self) -> List[Dict[str, Any]]:
        return [{'id': 'mock-lib', 'name': 'Mock Library', 'type': 'movies'}]

    def get_movies(self, user_id: str = None, library_ids: List[str] = None) -> List[Dict[str, Any]]:
        return self.mock_movies.copy()
    
    def get_movie_by_imdb(self, imdb_id: str) -> Optional[Dict[str, Any]]:
        for movie in self.mock_movies:
            if movie['imdb_id'] == imdb_id:
                return movie
        return None


def create_jellyfin_service() -> JellyfinService:
    """
    Create Jellyfin service instance from environment variables
    
    Returns:
        JellyfinService instance or MockJellyfinService if not configured
    """
    server_url = os.getenv('JELLYFIN_URL')
    api_key = os.getenv('JELLYFIN_API_KEY')
    user_id = os.getenv('JELLYFIN_USER_ID')
    
    logger.info(f"Creating Jellyfin service with URL: {server_url}")
    logger.info(f"API Key present: {'Yes' if api_key else 'No'}")
    logger.info(f"User ID present: {'Yes' if user_id else 'No'}")
    
    if server_url and api_key:
        # Add protocol if missing
        if not server_url.startswith(('http://', 'https://')):
            server_url = f"http://{server_url}"
            logger.info(f"Added protocol, final URL: {server_url}")
        
        logger.info(f"Creating JellyfinService instance...")
        service = JellyfinService(server_url, api_key, user_id)
        logger.info(f"Testing connection to Jellyfin server...")
        
        if service.test_connection():
            logger.info("Connected to Jellyfin server successfully")
            return service
        else:
            logger.warning("Failed to connect to Jellyfin, using mock service")
            return MockJellyfinService()
    else:
        logger.info("Jellyfin not configured, using mock service")
        if not server_url:
            logger.info("Missing JELLYFIN_URL")
        if not api_key:
            logger.info("Missing JELLYFIN_API_KEY")
        return MockJellyfinService() 