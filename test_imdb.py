#!/usr/bin/env python3
"""
Test script for IMDB integration
Run this to test with a real API key
"""

import requests
import json

def test_omdb_search(query, api_key):
    """Test OMDB API search"""
    url = "http://www.omdbapi.com/"
    params = {
        's': query,
        'type': 'movie',
        'apikey': api_key
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        print(f"Search results for '{query}':")
        print(json.dumps(data, indent=2))
        
        if data.get('Response') == 'True':
            print(f"\nFound {len(data.get('Search', []))} results")
            for item in data.get('Search', []):
                print(f"- {item.get('Title')} ({item.get('Year')}) - {item.get('imdbID')}")
        else:
            print(f"Error: {data.get('Error', 'Unknown error')}")
            
    except Exception as e:
        print(f"Error: {e}")

def test_omdb_details(imdb_id, api_key):
    """Test OMDB API details"""
    url = "http://www.omdbapi.com/"
    params = {
        'i': imdb_id,
        'apikey': api_key
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        print(f"\nDetails for {imdb_id}:")
        print(json.dumps(data, indent=2))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("IMDB API Test Script")
    print("===================")
    
    # Get API key from user
    api_key = input("Enter your OMDB API key (or press Enter to skip): ").strip()
    
    if not api_key:
        print("\nNo API key provided. To get a free API key:")
        print("1. Go to http://www.omdbapi.com/")
        print("2. Click 'Get a free API Key'")
        print("3. Fill out the form")
        print("4. Use the key in this script or set it as IMDB_API_KEY environment variable")
        exit()
    
    # Test search
    test_omdb_search("National Treasure", api_key)
    
    # Test details (using a known IMDB ID)
    test_omdb_details("tt0317740", api_key)  # National Treasure 