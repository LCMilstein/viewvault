#!/usr/bin/env python3
"""
Simple test script for Jellyfin integration
"""

import os
import logging
from dotenv import load_dotenv
from jellyfin_service import create_jellyfin_service

# Load environment variables
load_dotenv('secrets.env')

# Set up logging
logging.basicConfig(level=logging.INFO)

def test_jellyfin_connection():
    """Test basic Jellyfin connection"""
    print("Testing Jellyfin connection...")
    
    # Create service
    service = create_jellyfin_service()
    
    # Test connection
    print(f"Connection test: {service.test_connection()}")
    
    # Test getting users
    users = service.get_users()
    print(f"Users found: {len(users)}")
    for user in users:
        print(f"  - {user.get('Name', 'Unknown')} (ID: {user.get('Id', 'Unknown')})")
    
    # Test getting a small sample of movies
    print("\nTesting movie retrieval (limited to 10 movies)...")
    try:
        # Override the limit for this test
        service.session.timeout = 10  # 10 second timeout
        movies = service.get_movies()
        print(f"Successfully retrieved {len(movies)} movies")
        
        # Show first few movies
        for i, movie in enumerate(movies[:5]):
            print(f"  {i+1}. {movie.get('name', 'Unknown')} ({movie.get('year', 'Unknown')}) - Quality: {movie.get('quality', 'Unknown')}")
            
    except Exception as e:
        print(f"Error retrieving movies: {e}")

if __name__ == "__main__":
    test_jellyfin_connection() 