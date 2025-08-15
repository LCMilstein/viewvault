#!/usr/bin/env python3
"""
Test Jellyfin authentication and API access
"""

import os
import requests
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv('secrets.env')

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_jellyfin_auth():
    """Test different Jellyfin authentication methods"""
    
    server_url = os.getenv('JELLYFIN_URL')
    api_key = os.getenv('JELLYFIN_API_KEY')
    user_id = os.getenv('JELLYFIN_USER_ID')
    
    if not server_url or not api_key:
        logger.error("Missing JELLYFIN_URL or JELLYFIN_API_KEY")
        return
    
    # Add protocol if missing
    if not server_url.startswith(('http://', 'https://')):
        server_url = f"http://{server_url}"
    
    logger.info(f"Testing Jellyfin connection to: {server_url}")
    logger.info(f"API Key: {api_key[:10]}...")
    logger.info(f"User ID: {user_id}")
    
    # Test 1: System Info (should work)
    logger.info("\n=== Test 1: System Info ===")
    session = requests.Session()
    session.headers.update({
        'X-Emby-Token': api_key,
        'Content-Type': 'application/json'
    })
    
    try:
        response = session.get(f"{server_url}/System/Info")
        logger.info(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            logger.info(f"Server Name: {data.get('ServerName', 'Unknown')}")
            logger.info(f"Version: {data.get('Version', 'Unknown')}")
        else:
            logger.error(f"Response: {response.text}")
    except Exception as e:
        logger.error(f"Error: {e}")
    
    # Test 2: Users endpoint
    logger.info("\n=== Test 2: Users ===")
    try:
        response = session.get(f"{server_url}/Users")
        logger.info(f"Status: {response.status_code}")
        if response.status_code == 200:
            users = response.json()
            logger.info(f"Found {len(users)} users")
            for user in users:
                logger.info(f"  - {user.get('Name', 'Unknown')} (ID: {user.get('Id', 'Unknown')})")
        else:
            logger.error(f"Response: {response.text}")
    except Exception as e:
        logger.error(f"Error: {e}")
    
    # Test 3: Specific user views
    if user_id:
        logger.info(f"\n=== Test 3: User Views (User ID: {user_id}) ===")
        try:
            response = session.get(f"{server_url}/Users/{user_id}/Views")
            logger.info(f"Status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                items = data.get('Items', [])
                logger.info(f"Found {len(items)} views/libraries")
                for item in items:
                    logger.info(f"  - {item.get('Name', 'Unknown')} (Type: {item.get('CollectionType', 'Unknown')})")
            else:
                logger.error(f"Response: {response.text}")
        except Exception as e:
            logger.error(f"Error: {e}")
    
    # Test 4: Try without user_id
    logger.info("\n=== Test 4: Views without user_id ===")
    try:
        response = session.get(f"{server_url}/Users/Views")
        logger.info(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            items = data.get('Items', [])
            logger.info(f"Found {len(items)} views/libraries")
            for item in items:
                logger.info(f"  - {item.get('Name', 'Unknown')} (Type: {item.get('CollectionType', 'Unknown')})")
        else:
            logger.error(f"Response: {response.text}")
    except Exception as e:
        logger.error(f"Error: {e}")
    
    # Test 5: Try with different auth header
    logger.info("\n=== Test 5: Different auth header ===")
    session2 = requests.Session()
    session2.headers.update({
        'Authorization': f'MediaBrowser Token="{api_key}"',
        'Content-Type': 'application/json'
    })
    
    try:
        response = session2.get(f"{server_url}/Users/{user_id}/Views")
        logger.info(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            items = data.get('Items', [])
            logger.info(f"Found {len(items)} views/libraries")
            for item in items:
                logger.info(f"  - {item.get('Name', 'Unknown')} (Type: {item.get('CollectionType', 'Unknown')})")
        else:
            logger.error(f"Response: {response.text}")
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    test_jellyfin_auth() 