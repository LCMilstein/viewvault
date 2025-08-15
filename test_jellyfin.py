#!/usr/bin/env python3
"""
Test script for Jellyfin integration
"""

import os
from dotenv import load_dotenv
from jellyfin_service import create_jellyfin_service

# Load environment variables
load_dotenv('secrets.env')

def test_jellyfin_service():
    """Test the Jellyfin service with mock data"""
    print("Testing Jellyfin service...")
    
    # Create service (will use mock if no env vars)
    service = create_jellyfin_service()
    
    # Test connection
    print(f"Connection test: {service.test_connection()}")
    
    # Test getting users
    users = service.get_users()
    print(f"Users found: {len(users)}")
    for user in users:
        print(f"  - {user.get('Name', 'Unknown')} (ID: {user.get('Id', 'Unknown')})")
    
    # Test getting movies
    movies = service.get_movies()
    print(f"\nMovies found: {len(movies)}")
    for movie in movies:
        print(f"  - {movie.get('name', 'Unknown')} ({movie.get('imdb_id', 'No IMDB ID')}) - Quality: {movie.get('quality', 'Unknown')}")
    
    # Test getting specific movie
    if movies:
        test_imdb = movies[0].get('imdb_id')
        if test_imdb:
            specific_movie = service.get_movie_by_imdb(test_imdb)
            if specific_movie:
                print(f"\nFound specific movie: {specific_movie.get('name')} - Quality: {specific_movie.get('quality')}")
            else:
                print(f"\nCould not find movie with IMDB ID: {test_imdb}")

if __name__ == "__main__":
    test_jellyfin_service() 