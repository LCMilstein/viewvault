#!/usr/bin/env python3
"""
Startup test script to identify container crash issues
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_environment():
    """Test environment variables and basic setup"""
    logger.info("Testing environment setup...")
    
    # Check if secrets.env exists
    if os.path.exists('secrets.env'):
        logger.info("secrets.env file found")
        load_dotenv('secrets.env')
    else:
        logger.warning("secrets.env file not found")
    
    # Check required environment variables
    required_vars = ['TMDB_API_KEY']
    for var in required_vars:
        if os.getenv(var):
            logger.info(f"{var} is set")
        else:
            logger.warning(f"{var} is not set")
    
    # Check optional environment variables
    optional_vars = ['IMDB_API_KEY', 'JELLYFIN_URL', 'JELLYFIN_API_KEY']
    for var in optional_vars:
        if os.getenv(var):
            logger.info(f"{var} is set")
        else:
            logger.info(f"{var} is not set (optional)")

def test_database():
    """Test database connection and basic operations"""
    logger.info("Testing database connection...")
    
    try:
        from database import engine
        from sqlmodel import SQLModel, Session, select
        from models import Movie, Series, User
        
        # Test basic connection
        with Session(engine) as session:
            logger.info("Database connection successful")
            
            # Test basic queries
            try:
                movies = session.exec(select(Movie)).all()
                logger.info(f"Found {len(movies)} movies in database")
            except Exception as e:
                logger.error(f"Error querying movies: {e}")
            
            try:
                series = session.exec(select(Series)).all()
                logger.info(f"Found {len(series)} series in database")
            except Exception as e:
                logger.error(f"Error querying series: {e}")
            
            try:
                users = session.exec(select(User)).all()
                logger.info(f"Found {len(users)} users in database")
            except Exception as e:
                logger.error(f"Error querying users: {e}")
                
    except Exception as e:
        logger.error(f"Database test failed: {e}")
        import traceback
        logger.error(f"Database error traceback: {traceback.format_exc()}")

def test_imports():
    """Test importing all required modules"""
    logger.info("Testing module imports...")
    
    modules_to_test = [
        'fastapi',
        'uvicorn',
        'sqlmodel',
        'requests',
        'python-multipart',
        'python-jose',
        'passlib',
        'slowapi',
        'tmdbv3api',
        'python-dotenv',
        'aiohttp'
    ]
    
    for module in modules_to_test:
        try:
            __import__(module.replace('-', '_'))
            logger.info(f"✓ {module} imported successfully")
        except ImportError as e:
            logger.error(f"✗ {module} import failed: {e}")

def test_file_structure():
    """Test that required files exist"""
    logger.info("Testing file structure...")
    
    required_files = [
        'main.py',
        'models.py',
        'database.py',
        'security.py',
        'requirements.txt',
        'static/app.js',
        'static/index.html'
    ]
    
    for file_path in required_files:
        if os.path.exists(file_path):
            logger.info(f"✓ {file_path} exists")
        else:
            logger.error(f"✗ {file_path} missing")

def main():
    """Run all tests"""
    logger.info("Starting startup tests...")
    
    try:
        test_environment()
        test_file_structure()
        test_imports()
        test_database()
        
        logger.info("All tests completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Startup test failed: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 