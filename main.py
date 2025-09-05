from dotenv import load_dotenv
import os

# Load environment variables from secrets.env if it exists
if os.path.exists('secrets.env'):
    load_dotenv('secrets.env')
    print("Loaded environment variables from secrets.env")
else:
    print("secrets.env not found, using system environment variables")
from fastapi import FastAPI, status, HTTPException, Query, Request, Depends, APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session, select, text, update
from models import Series, Episode, Movie, MovieCreate, SeriesCreate, EpisodeCreate, User, UserCreate, UserLogin, Token, List, ListItem, ListPermission, ListCreate, ListUpdate, ListItemAdd, ListItemUpdate, ChangePassword, LibraryImportHistory
from security import get_current_user, get_current_admin_user, authenticate_user, create_access_token, get_password_hash, ACCESS_TOKEN_EXPIRE_MINUTES
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from datetime import timedelta
from contextlib import asynccontextmanager
# from typing import List  # Commented out to avoid conflict with our List model
from imdb_service import IMDBService, MockIMDBService
import os
from tmdb_service import movie_api, tv_api, get_tv_details_with_imdb, get_collection_movies_by_imdb, get_collection_movies_by_tmdb_id, find_api, get_tmdb_movie_by_imdb, get_tmdb_series_by_imdb, get_all_episodes_by_imdb, get_collection_details_by_tmdb_id
from jellyfin_service import create_jellyfin_service
import requests
import re
from database import engine
import base64
import shutil
import logging
import time
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional  # Removed List to avoid conflict with our List model
from contextlib import asynccontextmanager

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# SOFT DELETE BEHAVIOR - CRITICAL FOR USER PRIVACY
# =============================================================================
# IMPORTANT: Soft deletes are user-specific and respect user boundaries
# 
# ✅ CORRECT BEHAVIOR:
# - User A soft-deletes "Cinderella III" → Hidden from User A only
# - User B can still see and import "Cinderella III" 
# - Manual re-import restores soft-deleted items for that user
# - Cron jobs and automatic processes respect soft delete flags
#
# ❌ INCORRECT BEHAVIOR (FIXED):
# - Admin functions were querying deleted items globally
# - This could interfere with user-specific collection imports
# - Now all admin functions properly respect user boundaries
# =============================================================================

# Rate limiting for TMDB API calls
tmdb_last_call_time = 0
tmdb_min_interval = 0.1  # 100ms between calls

def rate_limit_tmdb():
    """Simple rate limiting for TMDB API calls"""
    global tmdb_last_call_time
    current_time = time.time()
    time_since_last_call = current_time - tmdb_last_call_time
    if time_since_last_call < tmdb_min_interval:
        sleep_time = tmdb_min_interval - time_since_last_call
        time.sleep(sleep_time)
    tmdb_last_call_time = time.time()

# Initialize IMDB service (use mock for development, real service with API key)
imdb_api_key = os.getenv("IMDB_API_KEY")
print(f"🔍 IMDB DEBUG: IMDB_API_KEY = {imdb_api_key}")
print(f"🔍 IMDB DEBUG: IMDB_API_KEY type = {type(imdb_api_key)}")
print(f"🔍 IMDB DEBUG: IMDB_API_KEY length = {len(imdb_api_key) if imdb_api_key else 0}")

if imdb_api_key:
    print("🔍 IMDB DEBUG: Using real IMDBService")
    imdb_service = IMDBService(imdb_api_key)
else:
    print("🔍 IMDB DEBUG: Using MockIMDBService")
    imdb_service = MockIMDBService()

def create_db_and_tables():
    """Create database tables with better error handling"""
    logger.info("Starting database initialization...")
    
    try:
        # Create all tables based on current models
        logger.info("Creating SQLModel tables...")
        SQLModel.metadata.create_all(engine)
        logger.info("SQLModel tables created successfully")
        
        # Ensure all required columns exist by checking and adding missing ones
        logger.info("Checking and updating database schema...")
        with Session(engine) as session:
            
            # Check if quality column exists in movie table
            logger.info("Checking movie table schema...")
            result = session.execute(text("PRAGMA table_info(movie)"))
            columns = [row[1] for row in result.fetchall()]
            logger.info(f"Movie table columns: {columns}")
            
            if 'quality' not in columns:
                logger.info("Adding quality column to movie table...")
                session.execute(text("ALTER TABLE movie ADD COLUMN quality TEXT"))
                session.commit()
                logger.info("Added missing quality column to movie table")
            
            # Check if is_new column exists in movie table
            if 'is_new' not in columns:
                logger.info("Adding is_new column to movie table...")
                session.execute(text("ALTER TABLE movie ADD COLUMN is_new BOOLEAN DEFAULT FALSE"))
                session.commit()
                logger.info("Added missing is_new column to movie table")
            
            # Check if is_new column exists in series table
            logger.info("Checking series table schema...")
            series_result = session.execute(text("PRAGMA table_info(series)"))
            series_columns = [row[1] for row in series_result.fetchall()]
            logger.info(f"Series table columns: {series_columns}")
            
            if 'is_new' not in series_columns:
                logger.info("Adding is_new column to series table...")
                session.execute(text("ALTER TABLE series ADD COLUMN is_new BOOLEAN DEFAULT FALSE"))
                session.commit()
                logger.info("Added missing is_new column to series table")
            
            # Check if runtime column exists in movie table
            if 'runtime' not in columns:
                logger.info("Adding runtime column to movie table...")
                session.execute(text("ALTER TABLE movie ADD COLUMN runtime INTEGER"))
                session.commit()
                logger.info("Added missing runtime column to movie table")
            
            # Check if average_episode_runtime column exists in series table
            if 'average_episode_runtime' not in series_columns:
                logger.info("Adding average_episode_runtime column to series table...")
                session.execute(text("ALTER TABLE series ADD COLUMN average_episode_runtime INTEGER"))
                session.commit()
                logger.info("Added missing average_episode_runtime column to series table")
            
            # Check if user_id columns exist and add if missing
            if 'user_id' not in columns:
                logger.info("Adding user_id column to movie table...")
                session.execute(text("ALTER TABLE movie ADD COLUMN user_id INTEGER"))
                session.commit()
                logger.info("Added missing user_id column to movie table")
            
            if 'user_id' not in series_columns:
                logger.info("Adding user_id column to series table...")
                session.execute(text("ALTER TABLE series ADD COLUMN user_id INTEGER"))
                session.commit()
                logger.info("Added missing user_id column to series table")
            
            # Check if deleted columns exist and add if missing
            if 'deleted' not in columns:
                logger.info("Adding deleted column to movie table...")
                session.execute(text("ALTER TABLE movie ADD COLUMN deleted BOOLEAN DEFAULT FALSE"))
                session.commit()
                logger.info("Added missing deleted column to movie table")
            
            if 'deleted' not in series_columns:
                logger.info("Adding deleted column to series table...")
                session.execute(text("ALTER TABLE series ADD COLUMN deleted BOOLEAN DEFAULT FALSE"))
                session.commit()
                logger.info("Added missing deleted column to series table")
            
            # Check if notes columns exist and add if missing
            if 'notes' not in columns:
                logger.info("Adding notes column to movie table...")
                session.execute(text("ALTER TABLE movie ADD COLUMN notes TEXT"))
                session.commit()
                logger.info("Added missing notes column to movie table")
            
            if 'notes' not in series_columns:
                logger.info("Adding notes column to series table...")
                session.execute(text("ALTER TABLE series ADD COLUMN notes TEXT"))
                session.commit()
                logger.info("Added missing notes column to series table")
            
            # Check if added_at column exists and add if missing
            if 'added_at' not in columns:
                logger.info("Adding added_at column to movie table...")
                session.execute(text("ALTER TABLE movie ADD COLUMN added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"))
                session.commit()
                logger.info("Added missing added_at column to movie table")
            
            # Check if series.added_at column exists and add if missing
            if 'added_at' not in series_columns:
                logger.info("Adding added_at column to series table...")
                session.execute(text("ALTER TABLE series ADD COLUMN added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"))
                session.commit()
                logger.info("Added missing added_at column to series table")
            
            # Check episode table schema
            logger.info("Checking episode table schema...")
            episode_result = session.execute(text("PRAGMA table_info(episode)"))
            episode_columns = [row[1] for row in episode_result.fetchall()]
            logger.info(f"Episode table columns: {episode_columns}")
            
            if 'notes' not in episode_columns:
                logger.info("Adding notes column to episode table...")
                session.execute(text("ALTER TABLE episode ADD COLUMN notes TEXT"))
                session.commit()
                logger.info("Added missing notes column to episode table")
            
            # Ensure soft-delete column exists on episode table
            if 'deleted' not in episode_columns:
                logger.info("Adding deleted column to episode table...")
                session.execute(text("ALTER TABLE episode ADD COLUMN deleted BOOLEAN DEFAULT FALSE"))
                session.commit()
                logger.info("Added missing deleted column to episode table")
            
            # Check if user table exists, create if not
            logger.info("Checking user table...")
            user_table_result = session.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='user'"))
            if not user_table_result.fetchone():
                logger.info("Creating user table...")
                session.execute(text("""
                    CREATE TABLE user (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        email TEXT,
                        hashed_password TEXT NOT NULL,
                        is_active BOOLEAN DEFAULT 1,
                        is_admin BOOLEAN DEFAULT 0
                    )
                """))
                session.commit()
                logger.info("Created user table")
            
            # Create default user if none exists
            logger.info("Checking for existing users...")
            user_count_result = session.execute(text("SELECT COUNT(*) FROM user"))
            user_count = user_count_result.fetchone()[0]
            logger.info(f"Found {user_count} existing users")
            
            if user_count == 0:
                logger.info("Creating default user...")
                from security import get_password_hash
                default_password_hash = get_password_hash("password")
                session.execute(text("""
                    INSERT INTO user (username, email, hashed_password, is_active, is_admin)
                    VALUES (:username, :email, :hashed_password, :is_active, :is_admin)
                """), {
                    "username": "default", 
                    "email": "default@example.com", 
                    "hashed_password": default_password_hash, 
                    "is_active": True, 
                    "is_admin": True
                })
                default_user_id = session.execute(text("SELECT last_insert_rowid()")).fetchone()[0]
                session.commit()
                logger.info(f"Created default user with ID: {default_user_id}")
            else:
                # Get the first user's ID
                default_user_result = session.execute(text("SELECT id FROM user LIMIT 1"))
                default_user_id = default_user_result.fetchone()[0]
                logger.info(f"Using existing user with ID: {default_user_id}")
            
            # Update existing movies to belong to default user
            logger.info("Updating existing movies to belong to default user...")
            try:
                movie_update_result = session.execute(text("UPDATE movie SET user_id = :user_id WHERE user_id IS NULL"), {"user_id": default_user_id})
                movie_count = movie_update_result.rowcount
                logger.info(f"Updated {movie_count} movies to belong to user {default_user_id}")
            except Exception as e:
                logger.warning(f"Could not update movies: {e}")
                movie_count = 0
            
            # Update existing series to belong to default user
            logger.info("Updating existing series to belong to default user...")
            try:
                series_update_result = session.execute(text("UPDATE series SET user_id = :user_id WHERE user_id IS NULL"), {"user_id": default_user_id})
                series_count = series_update_result.rowcount
                logger.info(f"Updated {series_count} series to belong to user {default_user_id}")
            except Exception as e:
                logger.warning(f"Could not update series: {e}")
                series_count = 0
            
            session.commit()
            logger.info("User ID migration completed successfully!")
                
    except Exception as e:
        logger.error(f"Error during database schema update: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Don't raise the exception - let the app start even if there are DB issues
        logger.warning("Continuing with app startup despite database errors...")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting application lifespan...")
    try:
        create_db_and_tables()
        logger.info("Database initialization completed")
    except Exception as e:
        logger.error(f"Error in lifespan: {e}")
        import traceback
        logger.error(f"Lifespan traceback: {traceback.format_exc()}")
    yield
    logger.info("Application lifespan ended")

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(lifespan=lifespan, title="ViewVault", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Favicon route
@app.get("/favicon.ico")
async def get_favicon():
    return FileResponse("static/icons/favicon.svg", media_type="image/svg+xml")

POSTER_DIR = os.path.join("static", "posters")
os.makedirs(POSTER_DIR, exist_ok=True)

api_router = APIRouter(prefix="/api")

@api_router.get("/")
def api_root():
    logger.info("API root endpoint called!")
    return {"message": "ViewVault API", "version": "1.0.0", "test": "UPDATED_CODE_RUNNING"}

@api_router.get("/test-db")
def test_database():
    """Test database connection and basic queries"""
    try:
        with Session(engine) as session:
            # Test basic queries
            movie_count = len(session.exec(select(Movie)).all())
            series_count = len(session.exec(select(Series)).all())
            episode_count = len(session.exec(select(Episode)).all())
            
            return {
                "status": "success",
                "movie_count": movie_count,
                "series_count": series_count,
                "episode_count": episode_count,
                "database": "connected",
                "code_version": "UPDATED_2024"
            }
    except Exception as e:
        logger.error(f"Database test failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "database": "failed",
            "code_version": "UPDATED_2024"
        }

@api_router.post("/auth/register", response_model=Token)
@limiter.limit("5/minute")
def register(request: Request, user: UserCreate):
    """Register a new user"""
    print(f"🔍 REGISTER: Starting registration for user: {user.username}")
    with Session(engine) as session:
        # Check if user already exists
        existing_user = session.exec(select(User).where(User.username == user.username)).first()
        if existing_user:
            print(f"❌ REGISTER: Username {user.username} already exists")
            raise HTTPException(status_code=400, detail="Username already registered")
        
        # Create new user
        hashed_password = get_password_hash(user.password)
        db_user = User(
            username=user.username,
            email=user.email,
            hashed_password=hashed_password,
            is_admin=False  # First user becomes admin
        )
        
        # Make first user admin
        print(f"🔍 REGISTER: Checking for existing admin users...")
        admin_count = session.exec(select(User).where(User.is_admin == True)).all()
        print(f"🔍 REGISTER: Found {len(admin_count)} admin users")
        if len(admin_count) == 0:
            print(f"✅ REGISTER: Making {db_user.username} the first admin user")
            db_user.is_admin = True
        else:
            print(f"❌ REGISTER: User {db_user.username} will be regular user (not first)")
        
        # Double-check admin count
        admin_count = session.exec(select(User).where(User.is_admin == True)).all()
        if len(admin_count) == 0:
            print(f"✅ REGISTER: Double-check confirmed - making {db_user.username} admin")
            db_user.is_admin = True
        
        print(f"🔍 REGISTER: Final user object - is_admin: {db_user.is_admin}")
        
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
        
        print(f"🔍 REGISTER: User created successfully - ID: {db_user.id}, is_admin: {db_user.is_admin}")
        
        # Verify the user was actually saved as admin
        saved_user = session.get(User, db_user.id)
        print(f"🔍 REGISTER: Saved user verification - ID: {saved_user.id}, is_admin: {saved_user.is_admin}")
        
        # Create access token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": db_user.username}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}

@api_router.post("/auth/login", response_model=Token)
@limiter.limit("10/minute")
def login(request: Request, user_credentials: UserLogin):
    """Login user and return access token"""
    user = authenticate_user(user_credentials.username, user_credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@api_router.get("/auth/me")
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    print(f"🔍 AUTH_ME: Called for user: {current_user.username}")
    print(f"🔍 AUTH_ME: User ID: {current_user.id}")
    print(f"🔍 AUTH_ME: Is admin: {current_user.is_admin}")
    print(f"🔍 AUTH_ME: User object: {current_user}")
    
    # Double-check from database
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if db_user:
            print(f"🔍 AUTH_ME: Database verification - ID: {db_user.id}, is_admin: {db_user.is_admin}")
        else:
            print(f"❌ AUTH_ME: User not found in database!")
        
        # Debug: Check all users in database
        print(f"🔍 AUTH_ME: Checking all users in database...")
        all_users = session.exec(select(User)).all()
        print(f"🔍 AUTH_ME: Found {len(all_users)} total users:")
        for user in all_users:
            print(f"  - User: {user.username}, ID: {user.id}, is_admin: {user.is_admin}")
        
        admin_users = session.exec(select(User).where(User.is_admin == True)).all()
        print(f"🔍 AUTH_ME: Found {len(admin_users)} admin users:")
        for user in admin_users:
            print(f"  - Admin: {user.username}, ID: {user.id}")
    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_admin": current_user.is_admin
    }

@api_router.post("/auth/change-password")
def change_password(payload: ChangePassword, current_user: User = Depends(get_current_user)):
    """Allow the authenticated user to change their own password."""
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        # Verify current password
        from security import verify_password, get_password_hash
        if not verify_password(payload.current_password, db_user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        if len(payload.new_password) < 8:
            raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
        db_user.hashed_password = get_password_hash(payload.new_password)
        session.add(db_user)
        session.commit()
        return {"status": "ok"}

@api_router.post("/auth/make-admin")
def make_current_user_admin(current_user: User = Depends(get_current_user)):
    """Make the current user an admin (for testing purposes)"""
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        db_user.is_admin = True
        session.add(db_user)
        session.commit()
        
        return {"status": "ok", "message": f"User {db_user.username} is now an admin"}

@api_router.post("/admin/users/{user_id}/toggle-admin")
def toggle_user_admin_status(user_id: int, admin_update: dict, current_user: User = Depends(get_current_admin_user)):
    """Toggle admin status for a user (admin only)"""
    print(f"🔍 TOGGLE_ADMIN: Admin {current_user.username} toggling admin status for user {user_id}")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")
    
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.id == user_id)).first()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            new_admin_status = admin_update.get("is_admin", False)
            print(f"🔍 TOGGLE_ADMIN: Setting user {user.username} admin status to {new_admin_status}")
            
            user.is_admin = new_admin_status
            session.add(user)
            session.commit()
            
            print(f"✅ TOGGLE_ADMIN: Successfully updated {user.username} admin status to {new_admin_status}")
            return {"message": f"User {user.username} admin status updated to {new_admin_status}"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ TOGGLE_ADMIN: Error updating admin status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update admin status: {str(e)}")

@app.get("/debug-users")
def debug_users():
    """Debug endpoint to see all users in database (no auth required)"""
    print(f"🔍 DEBUG: Checking all users in database...")
    with Session(engine) as session:
        users = session.exec(select(User)).all()
        print(f"🔍 DEBUG: Found {len(users)} users:")
        for user in users:
            print(f"  - User: {user.username}, ID: {user.id}, is_admin: {user.is_admin}")
        
        admin_users = session.exec(select(User).where(User.is_admin == True)).all()
        print(f"🔍 DEBUG: Found {len(admin_users)} admin users:")
        for user in admin_users:
            print(f"  - Admin: {user.username}, ID: {user.id}")
        
        return {
            "total_users": len(users),
            "admin_users": len(admin_users),
            "users": [{"username": u.username, "id": u.id, "is_admin": u.is_admin} for u in users]
        }

@api_router.delete("/auth/delete-current-user")
def delete_current_user(current_user: User = Depends(get_current_user)):
    """Delete the current user account (for testing purposes)"""
    print(f"🔍 DELETE_USER: Deleting user: {current_user.username} (ID: {current_user.id})")
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Delete all user's data first (in reverse dependency order)
        print(f"🔍 DELETE_USER: Deleting user data for {db_user.username}")
        
        # Delete list items
        list_items = session.exec(select(ListItem).where(ListItem.list_id.in_(
            select(List.id).where(List.user_id == current_user.id)
        ))).all()
        for item in list_items:
            session.delete(item)
        print(f"🔍 DELETE_USER: Deleted {len(list_items)} list items")
        
        # Delete lists
        lists = session.exec(select(List).where(List.user_id == current_user.id)).all()
        for list_item in lists:
            session.delete(list_item)
        print(f"🔍 DELETE_USER: Deleted {len(lists)} lists")
        
        # Delete episodes
        episodes = session.exec(select(Episode).where(Episode.series_id.in_(
            select(Series.id).where(Series.user_id == current_user.id)
        ))).all()
        for episode in episodes:
            session.delete(episode)
        print(f"🔍 DELETE_USER: Deleted {len(episodes)} episodes")
        
        # Delete series
        series = session.exec(select(Series).where(Series.user_id == current_user.id)).all()
        for series_item in series:
            session.delete(series_item)
        print(f"🔍 DELETE_USER: Deleted {len(series)} series")
        
        # Delete movies
        movies = session.exec(select(Movie).where(Movie.user_id == current_user.id)).all()
        for movie in movies:
            session.delete(movie)
        print(f"🔍 DELETE_USER: Deleted {len(movies)} movies")
        
        # Finally, delete the user
        session.delete(db_user)
        session.commit()
        
        print(f"✅ DELETE_USER: Successfully deleted user {current_user.username} and all their data")
        return {"message": f"User {current_user.username} and all their data have been deleted"}

TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"

@api_router.get("/search/movies/")
@limiter.limit("30/minute")
def search_movies(request: Request, query: str):
    print("[DEBUG] /search/movies/ endpoint called with query:", query)
    try:
        tmdb_results = movie_api.search(query)
        print(f"[DEBUG] Raw TMDB movie search results: {tmdb_results}")
        movies = []
        for m in tmdb_results:
            print(f"[DEBUG] Processing movie result: {m}")
            if not hasattr(m, 'id'):
                print(f"[DEBUG] Skipping result (no id): {m}")
                continue
            imdb_id = getattr(m, 'imdb_id', None)
            if not imdb_id:
                try:
                    details = movie_api.details(m.id)
                    imdb_id = getattr(details, 'imdb_id', None)
                    print(f"[DEBUG] Fetched details for movie id {m.id}: imdb_id={imdb_id}")
                except Exception as e:
                    print(f"[DEBUG] Failed to fetch details for movie id {m.id}: {e}")
                    continue
            if not imdb_id:
                print(f"[DEBUG] Skipping movie (no imdb_id): {m}")
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
        print(f"[DEBUG] Final movie results: {movies}")
        return movies
    except Exception as e:
        import traceback
        print(f"[ERROR] Movie search failed: {e}")
        traceback.print_exc()
        return {"error": "Movie search failed", "details": str(e)}, 500

@api_router.get("/search/series/")
@limiter.limit("30/minute")
def search_series(request: Request, query: str):
    print("[DEBUG] /search/series/ endpoint called with query:", query)
    try:
        tmdb_results = tv_api.search(query)
        print(f"[DEBUG] Raw TMDB series search results: {tmdb_results}")
        series = []
        for s in tmdb_results:
            print(f"[DEBUG] Processing series result: {s}")
            if not hasattr(s, 'id'):
                print(f"[DEBUG] Skipping result (no id): {s}")
                continue
            try:
                details = get_tv_details_with_imdb(s.id)
                imdb_id = details.get('imdb_id') if details else None
                print(f"[DEBUG] Fetched details for series id {getattr(s, 'id', None)}: imdb_id={imdb_id}")
            except Exception as e:
                print(f"[DEBUG] Failed to fetch details for series id {getattr(s, 'id', None)}: {e}")
                continue
            if not imdb_id:
                print(f"[DEBUG] Skipping series (no imdb_id): {s}")
                continue
            poster_path = getattr(s, 'poster_path', None)
            poster_url = f"{TMDB_IMAGE_BASE}{poster_path}" if poster_path else "/static/no-image.png"
            series.append({
                "title": getattr(s, 'name', None) or "Untitled",
                "imdb_id": imdb_id,
                "poster_url": poster_url,
                "episodes": []
            })
        print(f"[DEBUG] Final TMDB series results: {series}")
        # If no importable results, try TVMaze
        if not series:
            print("[DEBUG] No importable TMDB series found, trying TVMaze fallback...")
            tvmaze_results = search_series_tvmaze(query)
            print(f"[DEBUG] TVMaze fallback results: {tvmaze_results}")
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
        print(f"[ERROR] Series search failed: {e}")
        traceback.print_exc()
        return {"error": "Series search failed", "details": str(e)}, 500

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
        print(f"[ERROR] TVMaze search failed: {e}")
        return []

def fetch_and_store_poster_thumb(poster_url):
    try:
        if poster_url and poster_url.startswith('http'):
            resp = requests.get(poster_url, timeout=5)
            if resp.status_code == 200:
                return resp.content
    except Exception:
        pass
    return None

def save_poster_image(poster_url, imdb_id):
    if not poster_url or not poster_url.startswith("http"):
        return None
    try:
        resp = requests.get(poster_url, timeout=10)
        if resp.status_code == 200:
            ext = os.path.splitext(poster_url)[1]
            if not ext or len(ext) > 5:
                ext = ".jpg"
            filename = f"{imdb_id}{ext}"
            filepath = os.path.join(POSTER_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(resp.content)
            return f"/static/posters/{filename}"
    except Exception as e:
        print(f"[ERROR] Failed to save poster image: {e}")
    return None

@api_router.post("/import/movie/{imdb_id}")
async def import_movie(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a movie from IMDB by ID to specified lists"""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []
    
    movie_details = imdb_service.get_movie_details(imdb_id)
    if not movie_details:
        raise HTTPException(status_code=404, detail="Movie not found on IMDB")

    # Try to get collection info from TMDB
    tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
    collection_id = None
    collection_name = None
    if tmdb_movie:
        collection = tmdb_movie.get('belongs_to_collection')
        if collection and 'id' in collection:
            collection_id = collection['id']
            collection_name = collection.get('name')
            logger.info(f"Found collection: {collection_name} (ID: {collection_id}) for {imdb_id}")
    else:
        logger.info(f"No TMDB movie data found for {imdb_id}")

    # Check if movie already exists for this user
    with Session(engine) as session:
        # Check if movie exists globally for this user
        existing_movie = session.exec(select(Movie).where(Movie.imdb_id == imdb_id, Movie.user_id == current_user.id)).first()
        
        # If movie exists, check if it's already in the target lists
        if existing_movie and target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":  # Skip personal list as it's virtual
                    # Check if movie is already in this specific list
                    existing_item = session.exec(
                        select(ListItem).where(
                            ListItem.list_id == list_id,
                            ListItem.item_type == "movie",
                            ListItem.item_id == existing_movie.id,
                            ListItem.deleted == False
                        )
                    ).first()
                    
                    if existing_item:
                        raise HTTPException(
                            status_code=400, 
                            detail=f"Movie already exists in list '{list_id}'"
                        )
        
        # If movie doesn't exist, create it
        if not existing_movie:
            # Create new movie
            poster_url = None
            if tmdb_movie and getattr(tmdb_movie, 'poster_path', None):
                tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{tmdb_movie.poster_path}"
                poster_url = save_poster_image(tmdb_poster_url, imdb_id)
            if not poster_url and movie_details.poster_url and movie_details.poster_url.startswith("http"):
                poster_url = save_poster_image(movie_details.poster_url, imdb_id)
            if not poster_url:
                poster_url = "/static/no-image.png"
            # Get runtime from TMDB if available
            runtime = None
            if tmdb_movie and hasattr(tmdb_movie, 'runtime'):
                runtime = getattr(tmdb_movie, 'runtime')
            
            # Get overview from TMDB if available
            overview = None
            if tmdb_movie and tmdb_movie.get('overview'):
                overview = tmdb_movie.get('overview')
            
            movie = Movie(
                title=movie_details.title,
                imdb_id=movie_details.imdb_id,
                release_date=movie_details.release_date,
                runtime=runtime,
                watched=False,
                collection_id=collection_id,
                collection_name=collection_name,
                poster_url=poster_url,
                poster_thumb=None,
                overview=overview,  # Add overview from TMDB
                imported_at=datetime.now(timezone.utc),  # Track when imported for "Newly Imported" badges
                user_id=current_user.id
            )
            session.add(movie)
            session.commit()
            session.refresh(movie)
        else:
            # Movie already exists, update imported_at timestamp
            existing_movie.imported_at = datetime.now(timezone.utc)
            session.add(existing_movie)
            movie = existing_movie
        
        # Add to specified lists (if any)
        if target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":  # Skip personal list as it's virtual
                    try:
                        # Verify the list exists and user has access
                        target_list = session.exec(
                            select(List).where(
                                List.id == list_id,
                                List.user_id == current_user.id,
                                List.deleted == False
                            )
                        ).first()
                        
                        if target_list:
                            # Check if movie is already in this list
                            existing_item = session.exec(
                                select(ListItem).where(
                                    ListItem.list_id == list_id,
                                    ListItem.item_type == "movie",
                                    ListItem.item_id == movie.id,
                                    ListItem.deleted == False
                                )
                            ).first()
                            
                            if not existing_item:
                                new_list_item = ListItem(
                                    list_id=list_id,
                                    item_type="movie",
                                    item_id=movie.id,
                                    user_id=current_user.id
                                )
                                session.add(new_list_item)
                                logger.info(f"Added {movie.title} to list {target_list.name}")
                        else:
                            logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                    except Exception as e:
                        logger.error(f"Failed to add {movie.title} to list {list_id}: {e}")
                        # Continue with other lists even if one fails
            
                    # Import sequels if available (but don't block the main import)
        try:
            if collection_id and collection_name:
                logger.info(f"Found collection '{collection_name}' for {movie.title}, checking for sequels...")
                collection_movies = get_collection_movies_by_imdb(imdb_id)
                if collection_movies:
                    logger.info(f"Found {len(collection_movies)} movies in collection for {imdb_id}")
                    for sequel in collection_movies:
                        # Skip the original movie (it's already imported)
                        if sequel.get('title') == movie.title:
                            logger.info(f"Skipping original movie: {sequel.get('title')}")
                            continue
                            
                        logger.info(f"Processing sequel: {sequel.get('title', 'Unknown')}")
                        
                        # Get TMDB ID for sequel
                        tmdb_id = sequel.get('id')
                        if not tmdb_id:
                            logger.warning(f"No TMDB ID found for sequel {sequel.get('title', 'Unknown')}")
                            continue
                        
                        try:
                            # Get full details for sequel to get IMDB ID
                            full_details = movie_api.details(tmdb_id)
                            sequel_imdb_id = getattr(full_details, 'imdb_id', None)
                            
                            if not sequel_imdb_id:
                                logger.warning(f"No IMDB ID found for sequel {sequel.get('title', 'Unknown')}")
                                continue
                            
                            # Check if sequel already exists
                            existing_sequel = session.exec(
                                select(Movie).where(Movie.imdb_id == sequel_imdb_id, Movie.user_id == current_user.id)
                            ).first()
                            if existing_sequel:
                                logger.info(f"Skipping {sequel.get('title')} - Already exists in DB")
                                continue
                            
                            # Construct poster URL for sequel
                            sequel_poster_path = getattr(full_details, 'poster_path', None)
                            sequel_poster_url = None
                            if sequel_poster_path:
                                tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{sequel_poster_path}"
                                sequel_poster_url = save_poster_image(tmdb_poster_url, sequel_imdb_id)
                            if not sequel_poster_url:
                                sequel_poster_url = "/static/no-image.png"
                            
                            # Get collection info for sequel
                            collection = getattr(full_details, 'belongs_to_collection', None)
                            sequel_collection_id = collection.id if collection and hasattr(collection, 'id') else movie.collection_id
                            sequel_collection_name = collection.name if collection and hasattr(collection, 'name') else movie.collection_name
                            
                            sequel_movie = Movie(
                                title=getattr(full_details, 'title', sequel.get('title', 'Unknown')),
                                imdb_id=sequel_imdb_id,
                                release_date=getattr(full_details, 'release_date', sequel.get('release_date')),
                                poster_url=sequel_poster_url,
                                collection_id=sequel_collection_id,
                                collection_name=sequel_collection_name,
                                type="movie",
                                user_id=current_user.id,
                                imported_at=datetime.now(timezone.utc)  # Set imported timestamp for NEW badges
                            )
                            session.add(sequel_movie)
                            logger.info(f"Successfully added sequel: {sequel_movie.title} to database")
                        except Exception as e:
                            logger.error(f"Failed to get full details for sequel {sequel.get('title', 'Unknown')}: {e}")
                    
                    logger.info(f"Successfully processed sequels for {movie.title}")
            else:
                logger.info(f"No collection found for {movie.title}, skipping sequel import")
        except Exception as e:
            logger.warning(f"Failed to import sequels for {imdb_id}: {e}")
        
        # Commit everything (main movie, list items, and sequels)
        session.commit()
        
        # Capture movie data before session closes
        movie_data = {
            "id": movie.id,
            "title": movie.title,
            "imdb_id": movie.imdb_id
        }
    
    return {
        "success": True,
        "id": movie_data["id"],
        "title": movie_data["title"],
        "imdb_id": movie_data["imdb_id"],
        "message": f"Movie '{movie_data['title']}' imported successfully"
    }

@api_router.post("/import/movie/{imdb_id}/sequels")
async def import_movie_with_sequels(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a movie and all its sequels from TMDB (franchise/collection) to specified lists."""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []
    collection_movies = get_collection_movies_by_imdb(imdb_id)
    print(f"[IMPORT] Collection movies to process: {[m.get('title') for m in collection_movies]}")
    if not collection_movies:
        print("[IMPORT] No franchise/collection found for this movie on TMDB")
        raise HTTPException(status_code=404, detail="No franchise/collection found for this movie on TMDB")

    imported_movies = []
    skipped_movies = []
    collection_id = None
    collection_name = None
    # Get collection info from first movie
    if collection_movies and 'belongs_to_collection' in collection_movies[0] and collection_movies[0]['belongs_to_collection']:
        collection = collection_movies[0]['belongs_to_collection']
        collection_id = collection.get('id')
        collection_name = collection.get('name')
    with Session(engine) as session:
        for movie_data in collection_movies:
            tmdb_id = movie_data.get('id')
            print(f"[IMPORT] Processing: {movie_data.get('title')} (TMDB ID: {tmdb_id})")
            # Fetch full details to get IMDB ID
            full_details = movie_api.details(tmdb_id)
            imdb_id = getattr(full_details, 'imdb_id', None)
            if not imdb_id:
                # Fallback: try to fetch IMDB ID using find_api
                print(f"[IMPORT] No IMDB ID in TMDB details for {movie_data.get('title')}, trying find_api fallback...")
                try:
                    find_result = find_api.find(tmdb_id, external_source='tmdb_id')
                    if find_result and 'movie_results' in find_result and find_result['movie_results']:
                        imdb_id = find_result['movie_results'][0].get('imdb_id')
                        print(f"[IMPORT] Fallback IMDB ID for {movie_data.get('title')}: {imdb_id}")
                except Exception as e:
                    print(f"[IMPORT] Fallback find_api failed for {movie_data.get('title')}: {e}")
            if not imdb_id:
                print(f"[IMPORT] Skipping {movie_data.get('title')} - No IMDB ID in TMDB details or fallback.")
                skipped_movies.append({"title": movie_data.get('title'), "reason": "No IMDB ID in TMDB details or fallback"})
                continue
            existing = session.exec(select(Movie).where(Movie.imdb_id == imdb_id, Movie.user_id == current_user.id)).first()
            if existing:
                print(f"[IMPORT] Skipping {movie_data.get('title')} - Already exists in DB")
                skipped_movies.append({"title": movie_data.get('title'), "reason": "Already exists"})
                continue
            # Get collection info for each movie (should be same for all in collection)
            collection = getattr(full_details, 'belongs_to_collection', None)
            cid = collection.id if collection and hasattr(collection, 'id') else collection_id
            cname = collection.name if collection and hasattr(collection, 'name') else collection_name
            poster_url = None
            if full_details and getattr(full_details, 'poster_path', None):
                tmdb_poster_url = f"https://image.tmdb.org/t/p/w500{full_details.poster_path}"
                poster_url = save_poster_image(tmdb_poster_url, imdb_id)
            if not poster_url and movie_data.get('poster_url', '').startswith("http"):
                poster_url = save_poster_image(movie_data['poster_url'], imdb_id)
            if not poster_url:
                poster_url = "/static/no-image.png"
            # Get runtime from TMDB details
            runtime = getattr(full_details, 'runtime', None)
            
            # Get overview from TMDB details if available
            overview = None
            if hasattr(full_details, 'overview') and full_details.overview:
                overview = full_details.overview
            
            movie = Movie(
                title=getattr(full_details, 'title', movie_data.get('title')),
                imdb_id=imdb_id,
                release_date=getattr(full_details, 'release_date', movie_data.get('release_date')),
                runtime=runtime,
                watched=False,
                collection_id=cid,
                collection_name=cname,
                poster_url=poster_url,
                poster_thumb=None,
                overview=overview,  # Add overview from TMDB
                user_id=current_user.id
            )
            session.add(movie)
            imported_movies.append(movie)
            print(f"[IMPORT] Imported: {movie.title} ({movie.imdb_id})")
            
            # Add to specified lists (if any)
            if target_list_ids:
                for list_id in target_list_ids:
                    if list_id != "personal":  # Skip personal list as it's virtual
                        try:
                            # Verify the list exists and user has access
                            target_list = session.exec(
                                select(List).where(
                                    List.id == list_id,
                                    List.user_id == current_user.id,
                                    List.deleted == False
                                )
                            ).first()
                            
                            if target_list:
                                # Check if movie is already in this list
                                existing_item = session.exec(
                                    select(ListItem).where(
                                        ListItem.list_id == list_id,
                                        ListItem.item_type == "movie",
                                        ListItem.item_id == movie.id,
                                        ListItem.deleted == False
                                    )
                                ).first()
                                
                                if not existing_item:
                                    new_list_item = ListItem(
                                        list_id=list_id,
                                        item_type="movie",
                                        item_id=movie.id,
                                        user_id=current_user.id
                                    )
                                    session.add(new_list_item)
                                    print(f"[IMPORT] Added {movie.title} to list {target_list.name}")
                            else:
                                print(f"[IMPORT] List {list_id} not found or no access for user {current_user.username}")
                        except Exception as e:
                            print(f"[IMPORT] Failed to add {movie.title} to list {list_id}: {e}")
                            # Continue with other lists even if one fails
        
        session.commit()
        print(f"[IMPORT] Total imported: {len(imported_movies)}, Total skipped: {len(skipped_movies)}")
        return {
            "imported_movies": [m.title for m in imported_movies],
            "skipped_movies": skipped_movies,
            "total_imported": len(imported_movies),
            "total_skipped": len(skipped_movies),
            "tmdb_collection_size": len(collection_movies)
        }

@api_router.post("/admin/fetch-all-sequels")
async def fetch_all_sequels(current_user: User = Depends(get_current_admin_user)):
    """Scan existing movies and import sequels for any known collections/franchises.
    Admin-only so it can be run as a one-shot maintenance task."""
    imported = []
    skipped = []
    errors = []
    processed_ids = set()
    with Session(engine) as session:
        movies = session.exec(select(Movie).where(Movie.user_id == current_user.id)).all()
        collections = {}
        for m in movies:
            if m.collection_name:
                collections.setdefault(m.collection_name, []).append(m)
        # For each collection, pick earliest release as base and import sequels
        for cname, items in collections.items():
            base = sorted(items, key=lambda x: (x.release_date or '9999-12-31'))[0]
            if base.imdb_id and base.imdb_id not in processed_ids:
                processed_ids.add(base.imdb_id)
                try:
                    # Create a mock request for admin function
                    class MockRequest:
                        async def json(self):
                            return {"target_list_ids": []}
                    
                    res = await import_movie_with_sequels(base.imdb_id, MockRequest(), current_user=current_user)
                    imported.extend(res.get("imported_movies", []))
                    skipped.extend([s.get('title') for s in res.get("skipped_movies", [])])
                except HTTPException as he:
                    if he.status_code == 404:
                        skipped.append(f"{cname}: no collection")
                    else:
                        errors.append(f"{cname}: {he.detail}")
                except Exception as e:
                    errors.append(f"{cname}: {e}")
    return {"imported": imported, "skipped": skipped, "errors": errors}

@api_router.post("/import/series/{imdb_id}")
async def import_series(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a TV series from IMDB by ID with all episodes to specified lists"""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []
    # Handle both IMDB IDs and TMDB IDs with tmdb_ prefix
    if imdb_id.startswith('tmdb_'):
        # Extract TMDB ID from tmdb_ prefix
        tmdb_id = imdb_id.replace('tmdb_', '')
        # Get series details directly using TMDB ID
        details = get_tv_details_with_imdb(tmdb_id)
        if not details:
            raise HTTPException(status_code=404, detail="Series not found on TMDB")
        
        # Convert TMDB details to IMDB service format
        episodes = get_all_episodes_by_imdb(imdb_id)  # This will work with tmdb_ prefix
        series_details = type('obj', (object,), {
            'title': details.get('name', f"Series ({imdb_id})"),
            'imdb_id': imdb_id,
            'poster_url': f"https://image.tmdb.org/t/p/w500{details.get('poster_path', '')}" if details.get('poster_path') else None,
            'episodes': [type('obj', (object,), {
                'season': ep['season'],
                'episode': ep['episode'],
                'title': ep['title'],
                'air_date': ep['air_date']
            }) for ep in episodes]
        })
    else:
        # Use IMDB service for real IMDB IDs
        series_details = imdb_service.get_series_details(imdb_id)
        if not series_details:
            raise HTTPException(status_code=404, detail="Series not found on IMDB")
    
    with Session(engine) as session:
        # Check if series already exists for this user
        existing_series = session.exec(select(Series).where(Series.imdb_id == imdb_id, Series.user_id == current_user.id)).first()
        
        # If series exists, check if it's already in the target lists
        if existing_series and target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":  # Skip personal list as it's virtual
                    # Check if series is already in this specific list
                    existing_item = session.exec(
                        select(ListItem).where(
                            ListItem.list_id == list_id,
                            ListItem.item_type == "series",
                            ListItem.item_id == existing_series.id,
                            ListItem.deleted == False
                        )
                    ).first()
                    
                    if existing_item:
                        raise HTTPException(
                            status_code=400, 
                            detail=f"Series already exists in list '{list_id}'"
                        )
        
                # If series doesn't exist, create it
        if not existing_series:
            poster_url = None
            if series_details.poster_url and series_details.poster_url.startswith("http"):
                poster_url = save_poster_image(series_details.poster_url, imdb_id)
            if not poster_url:
                poster_url = "/static/no-image.png"
            # Get average episode runtime from TMDB if available
            average_episode_runtime = None
            if imdb_id.startswith('tmdb_'):
                tmdb_id = imdb_id.replace('tmdb_', '')
                details = get_tv_details_with_imdb(tmdb_id)
                if details and 'episode_run_time' in details and details['episode_run_time']:
                    average_episode_runtime = details['episode_run_time'][0] if details['episode_run_time'] else None
            
            series = Series(
                title=series_details.title,
                imdb_id=series_details.imdb_id,
                type="series",
                poster_url=poster_url,
                poster_thumb=None,
                average_episode_runtime=average_episode_runtime,
                user_id=current_user.id,
                imported_at=datetime.now(timezone.utc)  # Set imported timestamp for NEW badges
            )
            session.add(series)
            session.commit()
            session.refresh(series)
            
            # Import episodes
            imported_episodes = []
            for episode_data in series_details.episodes:
                episode = Episode(
                    series_id=series.id,
                    season=episode_data.season,
                    episode=episode_data.episode,
                    title=episode_data.title,
                    code=f"S{episode_data.season:02d}E{episode_data.episode:02d}",
                    air_date=episode_data.air_date,
                    watched=False
                )
                session.add(episode)
                imported_episodes.append(episode)
            
            session.commit()
        else:
            # Series already exists, use it
            series = existing_series
            imported_episodes = []
        
        # Add to specified lists (if any)
        if target_list_ids:
            for list_id in target_list_ids:
                if list_id != "personal":  # Skip personal list as it's virtual
                    try:
                        # Verify the list exists and user has access
                        target_list = session.exec(
                            select(List).where(
                                List.id == list_id,
                                List.user_id == current_user.id,
                                List.deleted == False
                            )
                        ).first()
                        
                        if target_list:
                            # Check if series is already in this list
                            existing_item = session.exec(
                                select(ListItem).where(
                                    ListItem.list_id == list_id,
                                    ListItem.item_type == "series",
                                    ListItem.item_id == series.id,
                                    ListItem.deleted == False
                                )
                            ).first()
                            
                            if not existing_item:
                                new_list_item = ListItem(
                                    list_id=list_id,
                                    item_type="series",
                                    item_id=series.id,
                                    user_id=current_user.id
                                )
                                session.add(new_list_item)
                                logger.info(f"Added {series.title} to list {target_list.name}")
                        else:
                            logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                    except Exception as e:
                        logger.error(f"Failed to add {series.title} to list {list_id}: {e}")
                        # Continue with other lists even if one fails
            
            # Commit list items
            session.commit()
        
        return {
            "series": series,
            "episodes_imported": len(imported_episodes),
            "episodes": imported_episodes
        }

@api_router.post("/import/series/{imdb_id}/full")
async def import_full_series(imdb_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """Import a TV series with ALL seasons and episodes from IMDB to specified lists"""
    # Get target list IDs from request body
    try:
        data = await request.json()
        target_list_ids = data.get('target_list_ids', [])
    except Exception:
        target_list_ids = []
    # Handle both IMDB IDs and TMDB IDs with tmdb_ prefix
    if imdb_id.startswith('tmdb_'):
        # Extract TMDB ID from tmdb_ prefix
        tmdb_id = imdb_id.replace('tmdb_', '')
        # Get series details directly using TMDB ID
        details = get_tv_details_with_imdb(tmdb_id)
    else:
        # Try TMDB first - convert IMDB ID to TMDB ID
        tmdb_series = get_tmdb_series_by_imdb(imdb_id)
        details = tmdb_series
    
    if details and details.get('name'):
        title = details['name']
    elif details and details.get('title'):
        title = details['title']
        poster_url = details.get('poster_path')
        if poster_url:
            poster_url = f"https://image.tmdb.org/t/p/w500{poster_url}"
        episodes = get_all_episodes_by_imdb(imdb_id)
        num_episodes = len(episodes)
        num_seasons = len(set(ep['season'] for ep in episodes)) if episodes else 0
        # Insert into Series table
        with Session(engine) as session:
            db_series = Series(title=title, imdb_id=imdb_id, type="series", user_id=current_user.id, imported_at=datetime.now(timezone.utc))
            session.add(db_series)
            session.commit()
            session.refresh(db_series)
            for ep in episodes:
                db_episode = Episode(
                    series_id=db_series.id,
                    season=ep['season'],
                    episode=ep['episode'],
                    title=ep['title'],
                    code=f"S{ep['season']:02d}E{ep['episode']:02d}",
                    air_date=ep['air_date'],
                    watched=False
                )
                session.add(db_episode)
            session.commit()
            
            # Add to specified lists (if any)
            if target_list_ids:
                for list_id in target_list_ids:
                    if list_id != "personal":  # Skip personal list as it's virtual
                        try:
                            # Verify the list exists and user has access
                            target_list = session.exec(
                                select(List).where(
                                    List.id == list_id,
                                    List.user_id == current_user.id,
                                    List.deleted == False
                                )
                            ).first()
                            
                            if target_list:
                                # Check if series is already in this list
                                existing_item = session.exec(
                                    select(ListItem).where(
                                        ListItem.list_id == list_id,
                                        ListItem.item_type == "series",
                                        ListItem.item_id == db_series.id,
                                        ListItem.deleted == False
                                    )
                                ).first()
                                
                                if not existing_item:
                                    new_list_item = ListItem(
                                        list_id=list_id,
                                        item_type="series",
                                        item_id=db_series.id,
                                        user_id=current_user.id
                                    )
                                    session.add(new_list_item)
                                    logger.info(f"Added {db_series.title} to list {target_list.name}")
                            else:
                                logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                        except Exception as e:
                            logger.error(f"Failed to add {db_series.title} to list {list_id}: {e}")
                            # Continue with other lists even if one fails
                
                # Commit list items
                session.commit()
            
        return {"success": True, "source": "tmdb", "num_episodes": num_episodes, "num_seasons": num_seasons}
    # If TMDB fails, try TVMaze
    tvmaze_data = get_series_from_tvmaze_by_imdb(imdb_id)
    if tvmaze_data:
        title = tvmaze_data.get('title', f"Series ({imdb_id})")
        poster_url = tvmaze_data.get('poster_url')
        with Session(engine) as session:
            db_series = Series(title=title, imdb_id=imdb_id, type="series", user_id=current_user.id, imported_at=datetime.now(timezone.utc))
            session.add(db_series)
            session.commit()
            session.refresh(db_series)
            episodes = get_all_episodes_by_imdb(imdb_id)
            num_episodes = len(episodes)
            num_seasons = len(set(ep['season'] for ep in episodes)) if episodes else 0
            for ep in episodes:
                db_episode = Episode(
                    series_id=db_series.id,
                    season=ep['season'],
                    episode=ep['episode'],
                    title=ep['title'],
                    code=f"S{ep['season']:02d}E{ep['episode']:02d}",
                    air_date=ep['air_date'],
                    watched=False
                )
                session.add(db_episode)
            session.commit()
            
            # Add to specified lists (if any)
            if target_list_ids:
                for list_id in target_list_ids:
                    if list_id != "personal":  # Skip personal list as it's virtual
                        try:
                            # Verify the list exists and user has access
                            target_list = session.exec(
                                select(List).where(
                                    List.id == list_id,
                                    List.user_id == current_user.id,
                                    List.deleted == False
                                )
                            ).first()
                            
                            if target_list:
                                # Check if series is already in this list
                                existing_item = session.exec(
                                    select(ListItem).where(
                                        ListItem.list_id == list_id,
                                        ListItem.item_type == "series",
                                        ListItem.item_id == db_series.id,
                                        ListItem.deleted == False
                                    )
                                ).first()
                                
                                if not existing_item:
                                    new_list_item = ListItem(
                                        list_id=list_id,
                                        item_type="series",
                                        item_id=db_series.id,
                                        user_id=current_user.id
                                    )
                                    session.add(new_list_item)
                                    logger.info(f"Added {db_series.title} to list {target_list.name}")
                            else:
                                logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                        except Exception as e:
                            logger.error(f"Failed to add {db_series.title} to list {list_id}: {e}")
                            # Continue with other lists even if one fails
                
                # Commit list items
                session.commit()
            
        return {"success": True, "source": "tvmaze", "num_episodes": num_episodes, "num_seasons": num_seasons}
    # If both fail, fallback to mock
    return {"success": True, "source": "mock", "num_episodes": 0, "num_seasons": 0}

def get_series_from_tvmaze_by_imdb(imdb_id: str):
    """Helper to fetch series info from TVMaze by IMDB ID."""
    url = f"https://api.tvmaze.com/lookup/shows?imdb={imdb_id}"
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "title": data.get("name"),
                "poster_url": data.get("image", {}).get("medium") or data.get("image", {}).get("original"),
            }
    except Exception as e:
        print(f"[ERROR] TVMaze lookup failed: {e}")
    return None

# Movie endpoints
@api_router.post("/movies/", status_code=status.HTTP_201_CREATED)
def add_movie(movie: MovieCreate):
    db_movie = Movie(**movie.model_dump())
    # Set manual import as new and set imported timestamp
    db_movie.is_new = True
    db_movie.imported_at = datetime.now(timezone.utc)
    with Session(engine) as session:
        session.add(db_movie)
        session.commit()
        session.refresh(db_movie)
        return db_movie

@api_router.get("/movies/")
def get_movies():
    with Session(engine) as session:
        movies = session.exec(select(Movie)).all()
        result = []
        for m in movies:
            poster_url = None
            # Try to get poster from OMDb if not present
            if hasattr(m, 'poster_url') and m.poster_url:
                poster_url = m.poster_url
            else:
                try:
                    from imdb_service import IMDBService
                    imdb_api_key = os.getenv("IMDB_API_KEY")
                    imdb_service = IMDBService(imdb_api_key) if imdb_api_key else None
                    if imdb_service:
                        details = imdb_service.get_movie_details(m.imdb_id)
                        poster_url = getattr(details, 'poster_url', None)
                except Exception:
                    poster_url = None
            if not poster_url:
                # Try TMDB with timeout
                try:
                    from tmdb_service import get_tmdb_movie_by_imdb
                    import threading
                    poster_result = {}
                    def fetch_tmdb():
                        try:
                            tmdb_movie = get_tmdb_movie_by_imdb(m.imdb_id)
                            if tmdb_movie and hasattr(tmdb_movie, 'poster_path') and tmdb_movie.poster_path:
                                poster_result['url'] = f"https://image.tmdb.org/t/p/w500{tmdb_movie.poster_path}"
                        except Exception:
                            pass
                    t = threading.Thread(target=fetch_tmdb)
                    t.start()
                    t.join(timeout=1)
                    poster_url = poster_result.get('url')
                except Exception:
                    poster_url = None
            if not poster_url:
                poster_url = "/static/no-image.png"
            result.append({
                "id": m.id,
                "title": m.title,
                "imdb_id": m.imdb_id,
                "release_date": m.release_date,
                "watched": m.watched,
                "collection_id": m.collection_id,
                "collection_name": m.collection_name,
                "poster_url": poster_url,
                "type": "movie"
            })
        return result

@api_router.get("/movies/{movie_id}")
def get_movie(movie_id: int):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        return {
            "id": movie.id,
            "title": movie.title,
            "imdb_id": movie.imdb_id,
            "release_date": movie.release_date,
            "runtime": movie.runtime,
            "watched": movie.watched,
            "collection_id": movie.collection_id,
            "collection_name": movie.collection_name,
            "poster_url": movie.poster_url,
            "poster_thumb": movie.poster_thumb,
            "overview": movie.overview,
            "notes": movie.notes,
            "added_at": movie.added_at,
            "user_id": movie.user_id
        }

@api_router.put("/movies/{movie_id}")
def update_movie(movie_id: int, movie_update: MovieCreate):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        for field, value in movie_update.model_dump().items():
            setattr(movie, field, value)
        
        session.add(movie)
        session.commit()
        session.refresh(movie)
        return {
            "id": movie.id,
            "title": movie.title,
            "imdb_id": movie.imdb_id,
            "release_date": movie.release_date,
            "runtime": movie.runtime,
            "watched": movie.watched,
            "collection_id": movie.collection_id,
            "collection_name": movie.collection_name,
            "poster_url": movie.poster_url,
            "poster_thumb": movie.poster_thumb,
            "overview": movie.overview,
            "notes": movie.notes,
            "added_at": movie.added_at,
            "user_id": movie.user_id
        }

@api_router.delete("/movies/{movie_id}")
def delete_movie(movie_id: int):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        session.delete(movie)
        session.commit()
        return {"message": "Movie deleted successfully"}

@api_router.patch("/movies/{movie_id}/watched")
def toggle_movie_watched(movie_id: int):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        movie.watched = not movie.watched
        session.add(movie)
        session.commit()
        session.refresh(movie)
        return {
            "id": movie.id,
            "title": movie.title,
            "imdb_id": movie.imdb_id,
            "release_date": movie.release_date,
            "runtime": movie.runtime,
            "watched": movie.watched,
            "collection_id": movie.collection_id,
            "collection_name": movie.collection_name,
            "poster_url": movie.poster_url,
            "poster_thumb": movie.poster_thumb,
            "overview": movie.overview,
            "notes": movie.notes,
            "added_at": movie.added_at,
            "user_id": movie.user_id
        }

# Series endpoints
@api_router.post("/series/", status_code=status.HTTP_201_CREATED)
def add_series(series: SeriesCreate):
    db_series = Series(**series.model_dump())
    # Set manual import as new and set imported timestamp
    db_series.is_new = True
    db_series.imported_at = datetime.now(timezone.utc)
    with Session(engine) as session:
        session.add(db_series)
        session.commit()
        session.refresh(db_series)
        return db_series

@api_router.get("/series/")
def get_series():
    with Session(engine) as session:
        series = session.exec(select(Series)).all()
        result = []
        for s in series:
            poster_url = None
            # Try to get poster from OMDb if not present
            try:
                from imdb_service import IMDBService
                imdb_api_key = os.getenv("IMDB_API_KEY")
                imdb_service = IMDBService(imdb_api_key) if imdb_api_key else None
                if imdb_service:
                    details = imdb_service.get_series_details(s.imdb_id)
                    poster_url = getattr(details, 'poster_url', None)
            except Exception:
                poster_url = None
            if not poster_url:
                # Try TVMaze with timeout
                try:
                    from importlib import import_module
                    import threading
                    poster_result = {}
                    def fetch_tvmaze():
                        try:
                            get_series_from_tvmaze_by_imdb = import_module('main').get_series_from_tvmaze_by_imdb
                            tvmaze = get_series_from_tvmaze_by_imdb(s.imdb_id)
                            if tvmaze and tvmaze.get('poster_url'):
                                poster_result['url'] = tvmaze['poster_url']
                        except Exception:
                            pass
                    t = threading.Thread(target=fetch_tvmaze)
                    t.start()
                    t.join(timeout=1)
                    poster_url = poster_result.get('url')
                except Exception:
                    poster_url = None
            if not poster_url:
                poster_url = "/static/no-image.png"
            result.append({
                "id": s.id,
                "title": s.title,
                "imdb_id": s.imdb_id,
                "poster_url": poster_url,
                "type": "series"
            })
        return result

@api_router.get("/series/{series_id}")
def get_series_by_id(series_id: int):
    with Session(engine) as session:
        series = session.get(Series, series_id)
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        return series

@api_router.put("/series/{series_id}")
def update_series(series_id: int, series_update: SeriesCreate):
    with Session(engine) as session:
        series = session.get(Series, series_id)
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        
        for field, value in series_update.model_dump().items():
            setattr(series, field, value)
        
        session.add(series)
        session.commit()
        session.refresh(series)
        return series

@api_router.delete("/series/{series_id}")
def delete_series(series_id: int):
    with Session(engine) as session:
        series = session.get(Series, series_id)
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        
        session.delete(series)
        session.commit()
        return {"message": "Series deleted successfully"}

# Episode endpoints
@api_router.post("/episodes/", status_code=status.HTTP_201_CREATED)
def add_episode(episode: EpisodeCreate):
    db_episode = Episode(**episode.model_dump())
    with Session(engine) as session:
        session.add(db_episode)
        session.commit()
        session.refresh(db_episode)
        return db_episode

@api_router.get("/episodes/")
def get_episodes(series_id: int = None):
    with Session(engine) as session:
        if series_id:
            episodes = session.exec(select(Episode).where(Episode.series_id == series_id)).all()
        else:
            episodes = session.exec(select(Episode)).all()
        # Explicitly convert to dicts for JSON serialization
        return [
            {
                "id": ep.id,
                "series_id": ep.series_id,
                "season_number": ep.season,  # Frontend expects season_number
                "episode_number": ep.episode,  # Frontend expects episode_number
                "title": ep.title,
                "code": ep.code,
                "air_date": ep.air_date,
                "watched": ep.watched
            }
            for ep in episodes
        ]

@api_router.get("/episodes/{episode_id}")
def get_episode(episode_id: int):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found")
        return episode

@api_router.put("/episodes/{episode_id}")
def update_episode(episode_id: int, episode_update: EpisodeCreate):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found")
        
        for field, value in episode_update.model_dump().items():
            setattr(episode, field, value)
        
        session.add(episode)
        session.commit()
        session.refresh(episode)
        return episode

@api_router.delete("/episodes/{episode_id}")
def delete_episode(episode_id: int):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found")
        
        session.delete(episode)
        session.commit()
        return {"message": "Episode deleted successfully"}

@api_router.patch("/episodes/{episode_id}/watched")
def toggle_episode_watched(episode_id: int):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found")
        
        episode.watched = not episode.watched
        session.add(episode)
        session.commit()
        session.refresh(episode)
        return episode

@api_router.get("/episodes/{episode_id}/details")
def get_episode_details(episode_id: int, current_user: User = Depends(get_current_user)):
    """Get enhanced episode details from TMDB"""
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found")
        
        # Get series info
        series = session.get(Series, episode.series_id)
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        
        # Get enhanced data from TMDB
        enhanced_data = {
            "id": episode.id,
            "series_id": episode.series_id,
            "season_number": episode.season,
            "episode_number": episode.episode,
            "title": episode.title,
            "air_date": episode.air_date,
            "watched": episode.watched,
            "series_title": series.title,
            "overview": None,
            "still_path": None,
            "vote_average": None,
            "vote_count": None,
            "runtime": None
        }
        
        # Try to get TMDB data
        if series.imdb_id and series.imdb_id.startswith('tmdb_'):
            try:
                tmdb_id = series.imdb_id.replace('tmdb_', '')
                from tmdb_service import get_episode_details
                tmdb_data = get_episode_details(tmdb_id, episode.season, episode.episode)
                if tmdb_data:
                    enhanced_data.update({
                        "overview": tmdb_data.get('overview'),
                        "still_path": tmdb_data.get('still_path'),
                        "vote_average": tmdb_data.get('vote_average'),
                        "vote_count": tmdb_data.get('vote_count'),
                        "runtime": tmdb_data.get('runtime')
                    })
            except Exception as e:
                print(f"Error fetching TMDB episode data: {e}")
        
        return enhanced_data

# Utility endpoints
@api_router.get("/stats/")
def get_stats():
    with Session(engine) as session:
        total_movies = session.exec(select(Movie)).all()
        total_series = session.exec(select(Series)).all()
        total_episodes = session.exec(select(Episode)).all()
        
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

@api_router.get("/stats")
def get_stats_alias():
    return get_stats()

@api_router.get("/watchlist")
@api_router.get("/watchlist/")
def get_watchlist(current_user: User = Depends(get_current_user)):
    """
    Returns all movies (standalone and grouped), collections, and series (with episodes) in the watchlist.
    """
    try:
        with Session(engine) as session:
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
            except Exception as e:
                if "no such column: movie.is_new" in str(e):
                    # If is_new column doesn't exist, select without it but with user_id filter
                    # Also exclude movies that are in custom lists
                    from sqlalchemy import text
                    
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
                    print(f"Error processing movie {m.id}: {e}")
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
                    from sqlalchemy import text
                    
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
                    episodes = session.exec(select(Episode).where(Episode.series_id == s.id)).all()
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
                    print(f"🔍 Getting season posters for series {s.id} with IMDB ID: {s.imdb_id}")
                    if s.imdb_id:
                        try:
                            from tmdb_service import get_season_posters
                            tmdb_id = None
                            
                            if s.imdb_id.startswith('tmdb_'):
                                # Extract TMDB ID from tmdb_ prefix
                                tmdb_id = s.imdb_id.replace('tmdb_', '')
                                print(f"🔍 Using TMDB ID directly: {tmdb_id}")
                            else:
                                # Convert IMDB ID to TMDB ID if needed
                                tmdb_series = get_tmdb_series_by_imdb(s.imdb_id)
                                print(f"🔍 TMDB series found: {tmdb_series}")
                                if tmdb_series and 'id' in tmdb_series:
                                    tmdb_id = tmdb_series['id']
                            
                            if tmdb_id:
                                season_posters = get_season_posters(int(tmdb_id))
                                print(f"🔍 Season posters retrieved: {season_posters}")
                            else:
                                print(f"🔍 No TMDB ID found for series {s.id}")
                        except Exception as e:
                            print(f"Error getting season posters for series {s.id}: {e}")
                    else:
                        print(f"🔍 Skipping season posters for series {s.id} - no IMDB ID")
                    
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
                    print(f"Error processing series {s.id}: {e}")
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
    except Exception as e:
        print(f"Error in get_watchlist: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to load watchlist: {str(e)}")

@api_router.post("/watchlist/movie/{movie_id}/toggle")
def toggle_movie_watched(movie_id: int, current_user: User = Depends(get_current_user)):
    """Toggle watched status for a movie"""
    with Session(engine) as session:
        movie = session.exec(select(Movie).where(Movie.id == movie_id, Movie.user_id == current_user.id)).first()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        movie.watched = not movie.watched
        session.commit()
        session.refresh(movie)
        return {"message": "Movie watched status updated", "watched": movie.watched}

@api_router.post("/watchlist/series/{series_id}/toggle")
def toggle_series_watched(series_id: int, current_user: User = Depends(get_current_user)):
    """Toggle watched status for a series (marks all episodes as watched/unwatched)"""
    with Session(engine) as session:
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        
        # Get all episodes for this series
        episodes = session.exec(select(Episode).where(Episode.series_id == series_id)).all()
        
        # Toggle all episodes to the opposite of the first episode's status
        # If no episodes or all unwatched, mark all as watched
        # If any watched, mark all as unwatched
        should_mark_watched = not any(ep.watched for ep in episodes)
        
        for episode in episodes:
            episode.watched = should_mark_watched
        
        session.commit()
        return {"message": "Series watched status updated", "watched": should_mark_watched}

@api_router.post("/watchlist/collection/{collection_id}/toggle")
def toggle_collection_watched(collection_id: str, current_user: User = Depends(get_current_user)):
    """Toggle watched status for all movies in a collection"""
    with Session(engine) as session:
        # Get all movies in this collection for this user
        movies = session.exec(select(Movie).where(Movie.collection_id == collection_id, Movie.user_id == current_user.id)).all()
        
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

@api_router.post("/series/{series_id}/episodes/{season}/{episode}/toggle")
def toggle_episode_watched(series_id: int, season: int, episode: int, current_user: User = Depends(get_current_user)):
    """Toggle watched status for a specific episode"""
    with Session(engine) as session:
        # First verify the series belongs to this user
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        
        episode_obj = session.exec(
            select(Episode).where(
                Episode.series_id == series_id,
                Episode.season == season,
                Episode.episode == episode
            )
        ).first()
        
        if not episode_obj:
            raise HTTPException(status_code=404, detail="Episode not found")
        
        episode_obj.watched = not episode_obj.watched
        session.commit()
        session.refresh(episode_obj)
        return {"message": "Episode watched status updated", "watched": episode_obj.watched}

@api_router.delete("/watchlist/movie/{movie_id}")
def remove_movie_from_watchlist(movie_id: int, current_user: User = Depends(get_current_user)):
    """Remove a movie from the watchlist"""
    with Session(engine) as session:
        movie = session.exec(select(Movie).where(Movie.id == movie_id, Movie.user_id == current_user.id)).first()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        session.delete(movie)
        session.commit()
        return {"message": "Movie removed from watchlist"}

@api_router.post("/movies/{movie_id}/clear-newly-imported")
def clear_movie_newly_imported(movie_id: int, current_user: User = Depends(get_current_user)):
    """Clear the newly imported status for a movie"""
    with Session(engine) as session:
        movie = session.exec(select(Movie).where(Movie.id == movie_id, Movie.user_id == current_user.id)).first()
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        movie.imported_at = None
        session.add(movie)
        session.commit()
        return {"message": "Newly imported status cleared"}

@api_router.post("/series/{series_id}/clear-newly-imported")
def clear_series_newly_imported(series_id: int, current_user: User = Depends(get_current_user)):
    """Clear the newly imported status for a series"""
    with Session(engine) as session:
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        
        series.imported_at = None
        session.add(series)
        session.commit()
        return {"message": "Newly imported status cleared"}

@api_router.delete("/watchlist/series/{series_id}")
def remove_series_from_watchlist(series_id: int, current_user: User = Depends(get_current_user)):
    """Remove a series and all its episodes from the watchlist"""
    with Session(engine) as session:
        series = session.exec(select(Series).where(Series.id == series_id, Series.user_id == current_user.id)).first()
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")
        
        # Delete all episodes first
        episodes = session.exec(select(Episode).where(Episode.series_id == series_id)).all()
        for episode in episodes:
            session.delete(episode)
        
        # Delete the series
        session.delete(series)
        session.commit()
        return {"message": "Series and all episodes removed from watchlist"}

@api_router.delete("/watchlist/clear")
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

@api_router.post("/watchlist/{item_type}/{item_id}/interacted")
def mark_as_interacted(item_type: str, item_id: int, current_user: User = Depends(get_current_user)):
    """Mark an item as interacted (removes 'new' status)"""
    with Session(engine) as session:
        if item_type == "movie":
            item = session.exec(select(Movie).where(Movie.id == item_id, Movie.user_id == current_user.id)).first()
        elif item_type == "series":
            item = session.exec(select(Series).where(Series.id == item_id, Series.user_id == current_user.id)).first()
        elif item_type == "collection":
            # For collections, mark all movies in the collection as interacted
            movies = session.exec(select(Movie).where(Movie.collection_id == item_id, Movie.user_id == current_user.id)).all()
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

@api_router.get("/watchlist/unwatched/")
def get_unwatched_watchlist(sort_by: str = Query("added", enum=["added", "watched", "release_date"]), current_user: User = Depends(get_current_user)):
    """
    Returns all unwatched movies and all series with their unwatched episodes, grouped by series.
    Supports sorting by 'added', 'watched', or 'release_date'.
    """
    with Session(engine) as session:
        # Unwatched movies for this user
        movies = session.exec(select(Movie).where(Movie.watched == False, Movie.user_id == current_user.id)).all()
        # Sorting
        if sort_by == "release_date":
            movies.sort(key=lambda m: (m.release_date or ""))
        elif sort_by == "watched":
            movies.sort(key=lambda m: (m.watched, m.id))
        else:  # added (by added_at timestamp)
            movies.sort(key=lambda m: (m.added_at or ""))
        # Unwatched episodes grouped by series for this user
        user_series_ids = [s.id for s in session.exec(select(Series).where(Series.user_id == current_user.id)).all()]
        episodes = session.exec(select(Episode).where(Episode.watched == False, Episode.series_id.in_(user_series_ids))).all()
        series_map = {}
        for ep in episodes:
            if ep.series_id not in series_map:
                s = session.get(Series, ep.series_id)
                if not s:
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

@api_router.post("/admin/clear_all")
@limiter.limit("1/minute")
def clear_all(request: Request, current_user: User = Depends(get_current_admin_user)):
    """Clear all data - Admin only"""
    with Session(engine) as session:
        session.exec(text("DELETE FROM episode"))
        session.exec(text("DELETE FROM movie"))
        session.exec(text("DELETE FROM series"))
        session.commit()
    return {"message": "All data cleared"}

@api_router.get("/search/all/")
def search_all(query: str):
    """Unified search for both movies and TV series using TMDB."""
    print(f"[DEBUG] ====== search_all function called with query: '{query}' ======")
    print(f"[DEBUG] This is a test to see if the updated code is running!")
    print(f"[DEBUG] Function entry point reached!")
    print(f"[DEBUG] Query parameter: {query}")
    print(f"[DEBUG] Query type: {type(query)}")
    # Search movies
    movie_results = movie_api.search(query)
    print(f"[DEBUG] TMDB movie search results for '{query}': {movie_results}")
    movies = []
    for m in movie_results:
        if not hasattr(m, 'id'):
            print(f"[DEBUG] Skipping movie result (no id): {m}")
            continue
        imdb_id = getattr(m, 'imdb_id', None)
        if not imdb_id:
            details = movie_api.details(m.id)
            imdb_id = getattr(details, 'imdb_id', None)
            print(f"[DEBUG] Fetched details for movie id {m.id}: imdb_id={imdb_id}")
        if not imdb_id:
            print(f"[DEBUG] Skipping movie '{getattr(m, 'title', None)}' (TMDB id {m.id}) - no IMDB ID")
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
        print(f"[DEBUG] Included movie: {getattr(m, 'title', None)} (IMDB {imdb_id})")

    # Search TV series
    try:
        print(f"[DEBUG] Starting TV series search for '{query}'")
        series_results = tv_api.search(query)
        print(f"[DEBUG] TMDB series search results for '{query}': {series_results}")
        print(f"[DEBUG] Number of series results: {len(series_results) if series_results else 0}")
        series = []
        found_series_ids = set()
        normalized_query = query.strip().lower()
        
        if not series_results:
            print(f"[DEBUG] No series results found for '{query}'")
        else:
            for s in series_results:
                if not hasattr(s, 'id'):
                    print(f"[DEBUG] Skipping series result (no id): {s}")
                    continue
                print(f"[DEBUG] Processing series: id={getattr(s, 'id', None)}, name={getattr(s, 'name', None)}")
                found_series_ids.add(getattr(s, 'id', None))
                details = get_tv_details_with_imdb(s.id)
                print(f"[DEBUG] Full TMDB TV details for id {s.id}: {details}")
                imdb_id = details.get('imdb_id') if details else None
                print(f"[DEBUG] Fetched details for series id {s.id}: imdb_id={imdb_id}")
                if not imdb_id:
                    print(f"[DEBUG] Series '{getattr(s, 'name', None)}' (TMDB id {s.id}) has no IMDB ID from TMDB, but including it anyway")
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
                print(f"[DEBUG] Included series: {getattr(s, 'name', None)} (IMDB {imdb_id})")
    except Exception as e:
        print(f"[DEBUG] Error during TV series search: {e}")
        series = []
    # Enhanced fallback: if we have few or no series results, try a broader search
    if len(series) < 2:  # If we have less than 2 series results
        print(f"[DEBUG] Limited series results for '{query}', trying broader search...")
        # Use TMDB API directly to search for the series by name
        import os, requests
        api_key = os.environ.get("TMDB_API_KEY")
        url = f"https://api.themoviedb.org/3/search/tv?api_key={api_key}&query={requests.utils.quote(query)}"
        resp = requests.get(url)
        if resp.status_code == 200:
            data = resp.json()
            print(f"[DEBUG] Direct TMDB search/tv response for '{query}': {data}")
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
                    print(f"[DEBUG] Found broader match for '{query}' with id {result_id}, fetching details...")
                    details = get_tv_details_with_imdb(result_id)
                    print(f"[DEBUG] Direct fetch TMDB TV details for id {result_id}: {details}")
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
                        print(f"[DEBUG] Included broader series: {details.get('name')} (IMDB {imdb_id})")
                    else:
                        print(f"[DEBUG] Broader fetch for '{query}' did not yield an IMDB ID.")
        else:
            print(f"[DEBUG] TMDB API error for search/tv '{query}': {resp.status_code} {resp.text}")

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
    
    print(f"[DEBUG] Final sorted results (limited to 12): {limited_results}")
    return limited_results

@api_router.post("/import/by_url/")
async def import_by_url(request: Request):
    """Import a movie or series by IMDB or TVMaze URL (auto-detects type)."""
    try:
        data = await request.json()
    except Exception:
        return {"error": "Invalid JSON in request body."}, 400
    if not data or 'url' not in data:
        return {"error": "Missing 'url' in request body."}, 400
    url = data['url'].strip()
    if url.startswith('@'):
        url = url[1:].strip()
    print(f"[DEBUG] Import by URL: {url}")
    imdb_id = extract_imdb_id_from_url(url)
    if not imdb_id:
        # Try TVMaze URL
        imdb_id = get_imdb_id_from_tvmaze_url(url)
    if not imdb_id:
        return {"error": "Could not extract IMDB ID from URL."}, 400
    print(f"[DEBUG] Extracted IMDB ID: {imdb_id}")
    tmdb_result = find_api.find(imdb_id, external_source='imdb_id')
    print(f"[DEBUG] TMDB find result: {tmdb_result}")
    if tmdb_result.get('movie_results'):
        # Import as movie
        return import_movie(imdb_id)
    elif tmdb_result.get('tv_results'):
        # Import as series
        return import_series(imdb_id)
    else:
        return {"error": "IMDB ID not found as movie or series in TMDB."}, 404

def extract_imdb_id_from_url(url: str):
    # Remove any leading/trailing whitespace and leading '@'
    url = url.strip()
    if url.startswith('@'):
        url = url[1:].strip()
    # Match IMDB URLs: https://www.imdb.com/title/tt1234567 or /episode/tt1234567
    match = re.search(r"tt\d{7,8}", url)
    if match:
        return match.group(0)
    return None

def get_imdb_id_from_tvmaze_url(url: str):
    # TVMaze show: https://www.tvmaze.com/shows/82/game-of-thrones
    # TVMaze episode: https://www.tvmaze.com/episodes/4952/westworld-1x01-the-original
    # We'll call TVMaze API to get externals.imdb
    show_match = re.search(r"tvmaze.com/shows/(\d+)", url)
    ep_match = re.search(r"tvmaze.com/episodes/(\d+)", url)
    if show_match:
        show_id = show_match.group(1)
        resp = requests.get(f"https://api.tvmaze.com/shows/{show_id}")
        if resp.ok:
            data = resp.json()
            return data.get('externals', {}).get('imdb')
    elif ep_match:
        ep_id = ep_match.group(1)
        resp = requests.get(f"https://api.tvmaze.com/episodes/{ep_id}")
        if resp.ok:
            data = resp.json()
            show = data.get('show')
            if show:
                return show.get('externals', {}).get('imdb')
    return None

@api_router.post("/share/import")
def share_import(request: Request):
    """Endpoint for mobile/web sharing: accepts a URL, imports full series or movie+sequels automatically."""
    data = request.json() if hasattr(request, 'json') else None
    if not data or 'url' not in data:
        return {"error": "Missing 'url' in request body."}, 400
    url = data['url']
    print(f"[DEBUG] Share import by URL: {url}")
    imdb_id = extract_imdb_id_from_url(url)
    if not imdb_id:
        imdb_id = get_imdb_id_from_tvmaze_url(url)
    if not imdb_id:
        return {"error": "Could not extract IMDB ID from URL."}, 400
    print(f"[DEBUG] Extracted IMDB ID: {imdb_id}")
    from tmdb_service import find_api
    tmdb_result = find_api.find(imdb_id, external_source='imdb_id')
    print(f"[DEBUG] TMDB find result: {tmdb_result}")
    if tmdb_result.get('movie_results'):
        # Import movie with sequels
        try:
            result = import_movie_with_sequels(imdb_id)
            return {"success": True, "type": "movie", "imdb_id": imdb_id, "result": result}
        except Exception as e:
            return {"error": f"Failed to import movie with sequels: {e}"}, 500
    elif tmdb_result.get('tv_results'):
        # Import full series
        try:
            result = import_full_series(imdb_id)
            return {"success": True, "type": "series", "imdb_id": imdb_id, "result": result}
        except Exception as e:
            return {"error": f"Failed to import full series: {e}"}, 500
    else:
        return {"error": "IMDB ID not found as movie or series in TMDB."}, 404

@api_router.post("/import/url")
@api_router.post("/import/url/")
async def import_by_url_alias(request: Request):
    return await import_by_url(request)

@api_router.get("/import/jellyfin/progress")
async def get_import_progress(current_user: User = Depends(get_current_user)):
    """Get current import progress for the authenticated user"""
    try:
        # This would need to be stored in a more persistent way for production
        # For now, we'll return a default progress
        return {
            "phase": "No import in progress",
            "progress": 0,
            "current": 0,
            "total": 0,
            "batch_num": 0,
            "total_batches": 0
        }
    except Exception as e:
        logger.error(f"Error getting progress: {e}")
        return {"error": f"Failed to get progress: {str(e)}"}, 500

@api_router.get("/import/jellyfin/pre-scan/{library_name}")
async def pre_scan_jellyfin_library(library_name: str, current_user: User = Depends(get_current_user)):
    """Pre-scan a Jellyfin library to count total work for progress tracking"""
    try:
        logger.info(f"Pre-scanning Jellyfin library '{library_name}' for user {current_user.username}")
        jellyfin_service = create_jellyfin_service()
        
        if not jellyfin_service.test_connection():
            return {"error": "Failed to connect to Jellyfin server"}, 500
        
        # Get available libraries first
        try:
            libraries = jellyfin_service.get_libraries()
            logger.info(f"Libraries retrieved: {libraries}")
        except Exception as e:
            logger.error(f"Failed to get libraries: {e}")
            return {"error": f"Failed to get Jellyfin libraries: {str(e)}"}, 500
            
        if not libraries:
            logger.warning("No movie libraries found in Jellyfin")
            return {"error": "No movie libraries found in Jellyfin"}, 400
        
        # Find the specific library
        target_library = None
        for lib in libraries:
            if lib.get('name') == library_name:
                target_library = lib
                break
        
        if not target_library:
            available_libraries = [lib.get('name', 'Unknown') for lib in libraries]
            logger.warning(f"Library '{library_name}' not found. Available libraries: {available_libraries}")
            return {"error": f"Library '{library_name}' not found. Available libraries: {available_libraries}"}, 400
        
        # Get movies from the specific library
        try:
            jellyfin_movies = jellyfin_service.get_movies(library_ids=[target_library['id']])
            logger.info(f"Movies retrieved: {len(jellyfin_movies) if jellyfin_movies else 0} movies")
        except Exception as e:
            logger.error(f"Failed to get movies: {e}")
            return {"error": f"Failed to get movies from Jellyfin: {str(e)}"}, 500
        
        if not jellyfin_movies:
            return {"error": f"No movies found in library '{library_name}'"}, 404
        
        # Count total work
        total_movies = len(jellyfin_movies)
        estimated_collections = total_movies // 10  # Rough estimate of collections
        
        return {
            "total_movies": total_movies,
            "estimated_collections": estimated_collections,
            "total_work": total_movies + estimated_collections,
            "library_name": library_name
        }
        
    except Exception as e:
        logger.error(f"Pre-scan failed: {e}")
        return {"error": f"Pre-scan failed: {str(e)}"}, 500

@api_router.post("/import/jellyfin/")
@limiter.limit("100/hour")
async def import_from_jellyfin(request: Request, current_user: User = Depends(get_current_user)):
    logger.info(f"Jellyfin import called by user: {current_user.username if current_user else 'None'}")
    """Import movies from Jellyfin library with quality information"""
    # Get library name and target lists from request body
    try:
        data = await request.json()
        library_name = data.get('library_name', 'Movies')
        target_list_ids = data.get('list_ids', [])
    except Exception:
        library_name = 'Movies'
        target_list_ids = []
    
    logger.info(f"Importing from Jellyfin library: {library_name}")
    try:
        logger.info("Starting Jellyfin import...")
        try:
            # Debug environment variables
            logger.info(f"JELLYFIN_URL: {os.getenv('JELLYFIN_URL')}")
            logger.info(f"JELLYFIN_API_KEY: {os.getenv('JELLYFIN_API_KEY')[:10] + '...' if os.getenv('JELLYFIN_API_KEY') else 'None'}")
            logger.info(f"JELLYFIN_USER_ID: {os.getenv('JELLYFIN_USER_ID')[:10] + '...' if os.getenv('JELLYFIN_USER_ID') else 'None'}")
            
            jellyfin_service = create_jellyfin_service()
            logger.info(f"Jellyfin service created successfully: {type(jellyfin_service)}")
        except Exception as e:
            logger.error(f"Failed to create Jellyfin service: {e}")
            return {"error": f"Failed to create Jellyfin service: {str(e)}"}, 500
        
        logger.info("Testing Jellyfin connection...")
        if not jellyfin_service.test_connection():
            logger.error("Failed to connect to Jellyfin server")
            return {"error": "Failed to connect to Jellyfin server"}, 500
        
        # Get available libraries first
        logger.info("Getting Jellyfin libraries...")
        try:
            libraries = jellyfin_service.get_libraries()
            logger.info(f"Libraries retrieved: {libraries}")
        except Exception as e:
            logger.error(f"Failed to get libraries: {e}")
            return {"error": f"Failed to get Jellyfin libraries: {str(e)}"}, 500
            
        if not libraries:
            logger.warning("No movie libraries found in Jellyfin")
            return {"error": "No movie libraries found in Jellyfin"}, 400
        
        logger.info(f"Found {len(libraries)} movie libraries: {[lib['name'] for lib in libraries]}")
        
        # Find the specific library
        target_library = None
        for lib in libraries:
            if lib.get('name') == library_name:
                target_library = lib
                break
        
        if not target_library:
            available_libraries = [lib.get('name', 'Unknown') for lib in libraries]
            logger.warning(f"Library '{library_name}' not found. Available libraries: {available_libraries}")
            return {"error": f"Library '{library_name}' not found. Available libraries: {available_libraries}"}, 400
        
        logger.info(f"Using library: {target_library}")
        
        # Get movies from the specific library
        logger.info(f"Getting movies from library: {library_name}")
        try:
            jellyfin_movies = jellyfin_service.get_movies(library_ids=[target_library['id']])
            logger.info(f"Movies retrieved: {len(jellyfin_movies) if jellyfin_movies else 0} movies")
        except Exception as e:
            logger.error(f"Failed to get movies: {e}")
            return {"error": f"Failed to get movies from Jellyfin: {str(e)}"}, 500
        
        if not jellyfin_movies:
            logger.warning("No movies found in Jellyfin movie libraries")
            return {"message": "No movies found in Jellyfin movie libraries"}, 200
        
        logger.info(f"Retrieved {len(jellyfin_movies)} movies from Jellyfin")
        
        # Start progress tracking
        from progress_tracker import progress_tracker
        estimated_collections = len(jellyfin_movies) // 10  # Rough estimate
        import_id = progress_tracker.start_import(library_name, len(jellyfin_movies), estimated_collections)
        logger.info(f"Started progress tracking with ID: {import_id}")
        
        imported_count = 0
        updated_count = 0
        skipped_count = 0
        errors = []
        
        # Performance optimization: Batch process movies
        with Session(engine) as session:
            logger.info(f"Processing {len(jellyfin_movies)} movies from Jellyfin")
            
            # Process movies with valid IMDB IDs
            valid_movies = []
            
            for jellyfin_movie in jellyfin_movies:
                imdb_id = jellyfin_movie.get('imdb_id')
                movie_name = jellyfin_movie.get('name', 'Unknown')
                
                # Debug: log what we're getting from Jellyfin
                logger.info(f"Processing Jellyfin item: {movie_name}")
                logger.info(f"  - IMDB ID: {imdb_id}")
                logger.info(f"  - Provider IDs: {jellyfin_movie.get('provider_ids', 'None')}")
                logger.info(f"  - Type: {jellyfin_movie.get('type', 'Unknown')}")
                
                if not imdb_id or imdb_id == 'None' or imdb_id == '':
                    # Count movies without IMDB IDs as skipped (educational content, typos, etc.)
                    logger.info(f"Counting as skipped - no IMDB ID: {movie_name}")
                    skipped_count += 1
                    # Store skipped item info for transparency
                    if not hasattr(request.state, 'skipped_items'):
                        request.state.skipped_items = []
                    request.state.skipped_items.append({
                        'title': movie_name,
                        'reason': 'No IMDB ID - likely educational content or typo'
                    })
                    continue
                else:
                    valid_movies.append(jellyfin_movie)
            
            logger.info(f"Processing {len(valid_movies)} movies with valid IMDB IDs")
            
            # Batch fetch existing movies from database for current user
            existing_imdb_ids = set()
            if valid_movies:
                imdb_ids = [movie.get('imdb_id') for movie in valid_movies]
                existing_movies = session.exec(
                    select(Movie).where(Movie.imdb_id.in_(imdb_ids), Movie.user_id == current_user.id)
                ).all()
                existing_imdb_ids = {movie.imdb_id for movie in existing_movies}
                logger.info(f"Found {len(existing_imdb_ids)} existing movies in database for user {current_user.id}")
            
            # Process movies in batches
            batch_size = 10  # Process 10 movies at a time
            total_batches = (len(valid_movies) + batch_size - 1) // batch_size
            imported_movies = []  # Track movies for sequel processing
            for i in range(0, len(valid_movies), batch_size):
                batch = valid_movies[i:i + batch_size]
                batch_num = i // batch_size + 1
                logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} movies)")
                
                for jellyfin_movie in batch:
                    try:
                        imdb_id = jellyfin_movie.get('imdb_id')
                        movie_name = jellyfin_movie.get('name', 'Unknown')
                        logger.info(f"Processing movie: {movie_name} (IMDB: {imdb_id})")
                        
                        if imdb_id in existing_imdb_ids:
                            # Update existing movie with quality info
                            existing_movie = session.exec(
                                select(Movie).where(Movie.imdb_id == imdb_id, Movie.user_id == current_user.id)
                            ).first()
                            
                            if existing_movie:
                                old_quality = existing_movie.quality
                                new_quality = jellyfin_movie.get('quality')
                                logger.info(f"Checking {movie_name}: DB quality='{old_quality}' vs Jellyfin quality='{new_quality}'")
                                
                                # Normalize qualities for comparison (treat None, "Unknown", empty as equivalent)
                                def normalize_quality(q):
                                    # Treat these as all equivalent (low/unknown quality)
                                    if q in [None, "Unknown", "", "unknown", "SD"]:
                                        return "low_quality"
                                    return q
                                
                                db_quality_normalized = normalize_quality(old_quality)
                                jf_quality_normalized = normalize_quality(new_quality)
                                
                            if existing_movie and db_quality_normalized != jf_quality_normalized:
                                existing_movie.quality = new_quality
                                session.add(existing_movie)
                                updated_count += 1
                                logger.info(f"Updated quality for {movie_name}: '{old_quality}' → '{new_quality}'")
                                
                                # Add to specified lists (if any)
                                if target_list_ids:
                                    for list_id in target_list_ids:
                                        if list_id != "personal":  # Skip personal list as it's virtual
                                            try:
                                                # Verify the list exists and user has access
                                                target_list = session.exec(
                                                    select(List).where(
                                                        List.id == list_id,
                                                        List.user_id == current_user.id,
                                                        List.deleted == False
                                                    )
                                                ).first()
                                                
                                                if target_list:
                                                    # Check if movie is already in this list
                                                    existing_item = session.exec(
                                                        select(ListItem).where(
                                                            ListItem.list_id == list_id,
                                                            ListItem.item_type == "movie",
                                                            ListItem.item_id == existing_movie.id,
                                                            ListItem.deleted == False
                                                        )
                                                    ).first()
                                                    
                                                    if not existing_item:
                                                        new_list_item = ListItem(
                                                            list_id=list_id,
                                                            item_type="movie",
                                                            item_id=existing_movie.id,
                                                            user_id=current_user.id
                                                        )
                                                        session.add(new_list_item)
                                                        logger.info(f"Added {movie_name} to list {target_list.name}")
                                                else:
                                                    logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                            except Exception as e:
                                                logger.error(f"Failed to add {movie_name} to list {list_id}: {e}")
                                                # Continue with other lists even if one fails
                            else:
                                # Movie exists but no quality change needed - count as skipped
                                skipped_count += 1
                                logger.info(f"Skipped {movie_name} - already exists with same quality")
                                
                                # Still add to specified lists if needed
                                if target_list_ids and existing_movie:
                                    for list_id in target_list_ids:
                                        if list_id != "personal":  # Skip personal list as it's virtual
                                            try:
                                                # Verify the list exists and user has access
                                                target_list = session.exec(
                                                    select(List).where(
                                                        List.id == list_id,
                                                        List.user_id == current_user.id,
                                                        List.deleted == False
                                                    )
                                                ).first()
                                                
                                                if target_list:
                                                    # Check if movie is already in this list
                                                    existing_item = session.exec(
                                                        select(ListItem).where(
                                                            ListItem.list_id == list_id,
                                                            ListItem.item_type == "movie",
                                                            ListItem.item_id == existing_movie.id,
                                                            ListItem.deleted == False
                                                        )
                                                    ).first()
                                                    
                                                    if not existing_item:
                                                        new_list_item = ListItem(
                                                            list_id=list_id,
                                                            item_type="movie",
                                                            item_id=existing_movie.id,
                                                            user_id=current_user.id
                                                        )
                                                        session.add(new_list_item)
                                                        logger.info(f"Added {movie_name} to list {target_list.name}")
                                                else:
                                                    logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                            except Exception as e:
                                                logger.error(f"Failed to add {movie_name} to list {list_id}: {e}")
                                                # Continue with other lists even if one fails
                        else:
                            # Import new movie
                            try:
                                # Get movie details from TMDB
                                logger.info(f"Looking up movie {imdb_id} in TMDB...")
                                rate_limit_tmdb()  # Rate limit TMDB API calls
                                tmdb_movie = get_tmdb_movie_by_imdb(imdb_id)
                                if not tmdb_movie:
                                    logger.warning(f"Movie {imdb_id} not found in TMDB")
                                    skipped_count += 1
                                    continue
                                logger.info(f"Found TMDB data for {imdb_id}: {tmdb_movie.get('title', 'Unknown')}")
                                
                                # Create new movie
                                poster_path = tmdb_movie.get('poster_path')
                                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
                                logger.info(f"Constructed poster_url: {poster_url}")
                                
                                new_movie = Movie(
                                    title=tmdb_movie.get('title', jellyfin_movie.get('name', 'Unknown')),
                                    imdb_id=imdb_id,
                                    release_date=tmdb_movie.get('release_date'),
                                    quality=jellyfin_movie.get('quality'),
                                    overview=tmdb_movie.get('overview'),  # Add description from TMDB
                                    poster_url=poster_url,
                                    collection_id=tmdb_movie.get('belongs_to_collection', {}).get('id') if tmdb_movie.get('belongs_to_collection') else None,
                                    collection_name=tmdb_movie.get('belongs_to_collection', {}).get('name') if tmdb_movie.get('belongs_to_collection') else None,
                                    type="movie",
                                    user_id=current_user.id,
                                    is_new=0,  # Not new - this is imported content
                                    imported_at=datetime.now(timezone.utc)  # Track when imported
                                )
                                session.add(new_movie)
                                session.flush()  # Flush to get the movie ID
                                imported_count += 1
                                # Store collection info instead of the full Movie object to avoid session binding issues
                                if new_movie.collection_id and new_movie.collection_name:
                                    imported_movies.append({
                                        'collection_id': new_movie.collection_id,
                                        'collection_name': new_movie.collection_name
                                    })
                                logger.info(f"Successfully imported {movie_name}")
                                
                                # Add to specified lists (if any)
                                if target_list_ids:
                                    for list_id in target_list_ids:
                                        if list_id != "personal":  # Skip personal list as it's virtual
                                            try:
                                                # Verify the list exists and user has access
                                                target_list = session.exec(
                                                    select(List).where(
                                                        List.id == list_id,
                                                        List.user_id == current_user.id,
                                                        List.deleted == False
                                                    )
                                                ).first()
                                                
                                                if target_list:
                                                    # Check if movie is already in this list
                                                    existing_item = session.exec(
                                                        select(ListItem).where(
                                                            ListItem.list_id == list_id,
                                                            ListItem.item_type == "movie",
                                                            ListItem.item_id == new_movie.id,
                                                            ListItem.deleted == False
                                                        )
                                                    ).first()
                                                    
                                                    if not existing_item:
                                                        new_list_item = ListItem(
                                                            list_id=list_id,
                                                            item_type="movie",
                                                            item_id=new_movie.id,
                                                            user_id=current_user.id
                                                        )
                                                        session.add(new_list_item)
                                                        logger.info(f"Added {movie_name} to list {target_list.name}")
                                                else:
                                                    logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                            except Exception as e:
                                                logger.error(f"Failed to add {movie_name} to list {list_id}: {e}")
                                                # Continue with other lists even if one fails
                                
                                # Note: Sequel import moved to batch processing after all movies are imported
                                
                            except Exception as e:
                                error_msg = f"Error importing movie {imdb_id}: {e}"
                                logger.error(error_msg)
                                errors.append(error_msg)
                                skipped_count += 1
                                continue
                    
                    except Exception as e:
                        error_msg = f"Error processing movie {jellyfin_movie.get('name', 'Unknown')}: {e}"
                        logger.error(error_msg)
                        errors.append(error_msg)
                        skipped_count += 1
                        continue
                
                # Commit batch
                try:
                    session.commit()
                    logger.info(f"Committed batch {batch_num}/{total_batches}")
                    
                    # Update progress tracking for this batch
                    progress_data = {
                        "phase": f"Completed batch {batch_num}/{total_batches}",
                        "progress": min(80, (batch_num / total_batches) * 80),
                        "current": batch_num * batch_size,
                        "total": len(valid_movies),
                        "batch_num": batch_num,
                        "total_batches": total_batches
                    }
                    
                    # Store progress in session for frontend to poll
                    if not hasattr(request.state, 'import_progress'):
                        request.state.import_progress = {}
                    request.state.import_progress[current_user.id] = progress_data
                    
                except Exception as e:
                    logger.error(f"Error committing batch: {e}")
                    session.rollback()
                    return {"error": f"Database error: {str(e)}"}, 500
        

        
        # Import sequels in chunks for better performance
        logger.info("Importing sequels for movies with collections...")
        logger.info(f"DEBUG: imported_movies list has {len(imported_movies)} items")
        for i, movie_data in enumerate(imported_movies):
            logger.info(f"DEBUG: Movie {i}: collection_id={movie_data.get('collection_id')}, collection_name={movie_data.get('collection_name')}")
        
        total_sequels_imported = 0
        
        # Collect all unique collections to process
        unique_collections = {}
        for movie_data in imported_movies:
            if movie_data['collection_id'] and movie_data['collection_name']:
                if movie_data['collection_id'] not in unique_collections:
                    unique_collections[movie_data['collection_id']] = {
                        'name': movie_data['collection_name'],
                        'movies': []
                    }
                unique_collections[movie_data['collection_id']]['movies'].append(movie_data)
        
        logger.info(f"Processing {len(unique_collections)} unique collections...")
        
        # Process collections in chunks
        chunk_size = 5  # Process 5 collections at a time
        collection_ids = list(unique_collections.keys())
        
        for i in range(0, len(collection_ids), chunk_size):
            chunk = collection_ids[i:i + chunk_size]
            logger.info(f"Processing chunk {i//chunk_size + 1}/{(len(collection_ids) + chunk_size - 1)//chunk_size}")
            
            for collection_id in chunk:
                collection_info = unique_collections[collection_id]
                try:
                    logger.info(f"Processing collection '{collection_info['name']}'...")
                    rate_limit_tmdb()  # Rate limit TMDB API calls
                    collection_movies = get_collection_movies_by_tmdb_id(collection_id)
                    
                    if collection_movies:
                        logger.info(f"Found {len(collection_movies)} movies in collection '{collection_info['name']}'")
                         
                        # Import missing sequels
                        chunk_sequels_imported = 0
                        for sequel in collection_movies:
                            if sequel.get('imdb_id'):  # Skip movies without IMDB IDs
                                # Check if sequel already exists
                                existing_sequel = session.exec(
                                    select(Movie).where(Movie.imdb_id == sequel.get('imdb_id'), Movie.user_id == current_user.id)
                                ).first()
                                
                                if not existing_sequel:
                                    logger.info(f"Importing sequel: {sequel.get('title', 'Unknown')}")
                                    
                                    # Create sequel movie
                                    poster_path = sequel.get('poster_path')
                                    poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
                                    
                                    sequel_movie = Movie(
                                        title=sequel.get('title', 'Unknown'),
                                        imdb_id=sequel.get('imdb_id'),
                                        release_date=sequel.get('release_date'),
                                        runtime=sequel.get('runtime'),
                                        poster_url=poster_url,
                                        overview=sequel.get('overview'),
                                        collection_id=collection_id,
                                        collection_name=collection_info['name'],
                                        type="movie",
                                        user_id=current_user.id,
                                        is_new=0,  # Not new - this is imported content
                                        imported_at=datetime.now(timezone.utc)  # Set imported timestamp for NEW badges
                                    )
                                    session.add(sequel_movie)
                                    total_sequels_imported += 1
                                    chunk_sequels_imported += 1
                                    logger.info(f"Successfully added sequel: {sequel_movie.title}")
                                    
                                    # Add sequel to specified lists (if any)
                                    if target_list_ids:
                                        for list_id in target_list_ids:
                                            if list_id != "personal":  # Skip personal list as it's virtual
                                                try:
                                                    # Verify the list exists and user has access
                                                    target_list = session.exec(
                                                        select(List).where(
                                                            List.id == list_id,
                                                            List.user_id == current_user.id,
                                                            List.deleted == False
                                                        )
                                                    ).first()
                                                    
                                                    if target_list:
                                                        # Check if sequel is already in this list
                                                        existing_item = session.exec(
                                                            select(ListItem).where(
                                                                ListItem.list_id == list_id,
                                                                ListItem.item_type == "movie",
                                                                ListItem.item_id == sequel_movie.id,
                                                                ListItem.deleted == False
                                                            )
                                                        ).first()
                                                        
                                                        if not existing_item:
                                                            new_list_item = ListItem(
                                                                list_id=list_id,
                                                                item_type="movie",
                                                                item_id=sequel_movie.id,
                                                                user_id=current_user.id
                                                            )
                                                            session.add(new_list_item)
                                                            logger.info(f"Added sequel {sequel_movie.title} to list {target_list.name}")
                                                    else:
                                                        logger.warning(f"List {list_id} not found or no access for user {current_user.username}")
                                                except Exception as e:
                                                    logger.error(f"Failed to add sequel {sequel_movie.title} to list {list_id}: {e}")
                                                    # Continue with other lists even if one fails
                                else:
                                    logger.info(f"Skipping {sequel.get('title')} - Already exists in DB")
                        
                        logger.info(f"Completed collection '{collection_info['name']}' - {chunk_sequels_imported} sequels imported")
                    else:
                        logger.info(f"No collection movies found for collection '{collection_info['name']}'")
                
                except Exception as e:
                    logger.warning(f"Failed to process collection '{collection_info['name']}': {e}")
                    continue
            
            # Commit after each chunk
            if total_sequels_imported > 0:
                session.commit()
                logger.info(f"Committed chunk {i//chunk_size + 1} - {total_sequels_imported} total sequels imported")
                
                # Update progress for collection processing
                collection_progress = 80 + ((i // chunk_size + 1) / ((len(collection_ids) + chunk_size - 1) // chunk_size)) * 20
                progress_data = {
                    "phase": f"Processing collections - chunk {i//chunk_size + 1}",
                    "progress": min(95, collection_progress),
                    "current": len(valid_movies) + (i // chunk_size + 1) * chunk_size,
                    "total": len(valid_movies) + len(collection_ids),
                    "batch_num": i//chunk_size + 1,
                    "total_batches": (len(collection_ids) + chunk_size - 1) // chunk_size
                }
                
                if not hasattr(request.state, 'import_progress'):
                    request.state.import_progress = {}
                request.state.import_progress[current_user.id] = progress_data
        
        # Commit all sequel imports
        if total_sequels_imported > 0:
            session.commit()
            logger.info(f"Committed {total_sequels_imported} sequel imports")
        
        # Track library import history for automated updates
        try:
            for library in libraries:
                # Check if this library was already imported
                existing_history = session.exec(
                    select(LibraryImportHistory).where(
                        LibraryImportHistory.user_id == current_user.id,
                        LibraryImportHistory.library_id == library.get('id'),
                        LibraryImportHistory.deleted == False
                    )
                ).first()
                
                if existing_history:
                    # Update existing history
                    existing_history.last_imported = datetime.now(timezone.utc)
                    existing_history.import_count += 1
                    existing_history.is_automated = True  # Enable automated updates
                    session.add(existing_history)
                    logger.info(f"Updated import history for library '{library.get('name')}' - count: {existing_history.import_count}")
                else:
                    # Create new history
                    new_history = LibraryImportHistory(
                        user_id=current_user.id,
                        library_name=library.get('name'),
                        library_id=library.get('id'),
                        last_imported=datetime.now(timezone.utc),
                        import_count=1,
                        is_automated=True  # Enable automated updates
                    )
                    session.add(new_history)
                    logger.info(f"Created import history for library '{library.get('name')}'")
            
            session.commit()
            logger.info("Library import history updated successfully")
            
            # Complete progress tracking
            progress_tracker.complete_import(import_id)
            logger.info(f"Completed progress tracking for import: {import_id}")
            
        except Exception as e:
            logger.warning(f"Failed to update library import history: {e}")
            # Don't fail the import if history tracking fails
        
        # Get skipped items details if available
        skipped_items = getattr(request.state, 'skipped_items', [])
        
        return {
            "success": True,
            "message": f"Jellyfin import complete",
            "imported": imported_count,
            "updated": updated_count,
            "skipped": skipped_count,
            "skipped_items": skipped_items,  # Include details about what was skipped
            "sequels_imported": total_sequels_imported if 'total_sequels_imported' in locals() else 0,
            "total_jellyfin_movies": len(jellyfin_movies),
            "libraries_found": len(libraries),
            "errors": errors[:10] if errors else []  # Limit error messages
        }
        
    except Exception as e:
        logger.error(f"Jellyfin import failed: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {"error": f"Jellyfin import failed: {str(e)}", "traceback": traceback.format_exc()}, 500

@api_router.get("/import/jellyfin/libraries")
def get_jellyfin_libraries(current_user: User = Depends(get_current_user)):
    """Get list of available Jellyfin libraries"""
    try:
        logger.info("Getting Jellyfin libraries...")
        jellyfin_service = create_jellyfin_service()
        
        if not jellyfin_service.test_connection():
            return {"error": "Failed to connect to Jellyfin server"}, 500
        
        libraries = jellyfin_service.get_libraries()
        return {
            "libraries": libraries,
            "count": len(libraries),
            "service_type": str(type(jellyfin_service))
        }
    except Exception as e:
        logger.error(f"Failed to get Jellyfin libraries: {e}")
        return {"error": f"Failed to get Jellyfin libraries: {str(e)}"}, 500

@api_router.get("/import/jellyfin/libraries-debug")
def get_jellyfin_libraries_debug():
    """Get list of available Jellyfin libraries (no auth required for debugging)"""
    try:
        logger.info("Getting Jellyfin libraries (debug mode)...")
        jellyfin_service = create_jellyfin_service()
        
        if not jellyfin_service.test_connection():
            return {"error": "Failed to connect to Jellyfin server"}, 500
        
        libraries = jellyfin_service.get_libraries()
        return {
            "libraries": libraries,
            "count": len(libraries),
            "service_type": str(type(jellyfin_service))
        }
    except Exception as e:
        logger.error(f"Failed to get Jellyfin libraries: {e}")
        return {"error": f"Failed to get Jellyfin libraries: {str(e)}"}, 500

@api_router.get("/import/jellyfin/debug")
def debug_jellyfin():
    """Debug Jellyfin connection and service"""
    try:
        logger.info("Debugging Jellyfin service...")
        
        # Test service creation
        jellyfin_service = create_jellyfin_service()
        service_info = {
            "service_type": str(type(jellyfin_service)),
            "is_mock": "MockJellyfinService" in str(type(jellyfin_service))
        }
        
        # Test connection
        connection_ok = jellyfin_service.test_connection()
        
        # Test available methods
        available_methods = [method for method in dir(jellyfin_service) if not method.startswith('_')]
        
        # Test movies (first 3 only) - this should work even if get_libraries doesn't
        # Try to get movies from "Kids Movies" library specifically
        try:
            libraries = jellyfin_service.get_libraries()
            kids_library = None
            for lib in libraries:
                if lib.get('name') == 'Kids Movies':
                    kids_library = lib
                    break
            
            if kids_library:
                movies = jellyfin_service.get_movies(library_ids=[kids_library['id']])
            else:
                movies = jellyfin_service.get_movies()  # Fallback to all movies
        except Exception as e:
            logger.warning(f"Could not filter by library: {e}")
            movies = jellyfin_service.get_movies()  # Fallback to all movies
            
        sample_movies = movies[:3] if movies else []
        
        return {
            "service_info": service_info,
            "connection_ok": connection_ok,
            "available_methods": available_methods,
            "movies_count": len(movies) if movies else 0,
            "sample_movies": sample_movies,
            "env_vars": {
                "JELLYFIN_URL": "SET" if os.getenv('JELLYFIN_URL') else "NOT_SET",
                "JELLYFIN_API_KEY": "SET" if os.getenv('JELLYFIN_API_KEY') else "NOT_SET",
                "JELLYFIN_USER_ID": "SET" if os.getenv('JELLYFIN_USER_ID') else "NOT_SET"
            }
        }
    except Exception as e:
        logger.error(f"Jellyfin debug failed: {e}")
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }

@api_router.get("/import/jellyfin/test-auth")
def test_jellyfin_auth():
    """Test if authentication is working for Jellyfin endpoints"""
    return {
        "authenticated": True,
        "user": "test_user",
        "is_admin": True
    }

@api_router.get("/import/jellyfin/test-libraries")
def test_jellyfin_libraries():
    """Test getting movies from different libraries"""
    try:
        jellyfin_service = create_jellyfin_service()
        
        # Try to get movies from different potential library IDs
        test_library_ids = ['1', '2', '3', '4', '5']  # Common library IDs
        results = {}
        
        for lib_id in test_library_ids:
            try:
                movies = jellyfin_service.get_movies(library_ids=[lib_id])
                if movies:
                    results[lib_id] = {
                        'count': len(movies),
                        'sample': movies[:2],
                        'has_imdb_ids': any(m.get('imdb_id') for m in movies[:5])
                    }
            except Exception as e:
                results[lib_id] = {'error': str(e)}
        
        return {
            'library_tests': results,
            'total_libraries_found': len([r for r in results.values() if 'count' in r])
        }
    except Exception as e:
        return {'error': str(e)}

@api_router.get("/import/jellyfin/debug-movie-data")
def debug_movie_data():
    """Debug the raw movie data from Jellyfin to see provider IDs"""
    try:
        jellyfin_service = create_jellyfin_service()
        
        # Get a few sample movies to see their raw data
        movies = jellyfin_service.get_movies()
        sample_movies = movies[:5] if movies else []
        
        debug_data = []
        for movie in sample_movies:
            debug_data.append({
                'name': movie.get('name'),
                'imdb_id': movie.get('imdb_id'),
                'tmdb_id': movie.get('tmdb_id'),
                'quality': movie.get('quality'),
                'has_imdb': movie.get('imdb_id') is not None
            })
        
        return {
            "sample_movies": debug_data,
            "total_movies": len(movies) if movies else 0,
            "movies_with_imdb": len([m for m in movies if m.get('imdb_id')]) if movies else 0,
            "movies_without_imdb": len([m for m in movies if not m.get('imdb_id')]) if movies else 0
        }
    except Exception as e:
        logger.error(f"Debug movie data failed: {e}")
        return {"error": str(e)}

@api_router.get("/import/jellyfin/debug-provider-ids")
def debug_provider_ids():
    """Debug the raw provider IDs from Jellyfin to see what keys are available"""
    try:
        jellyfin_service = create_jellyfin_service()
        
        # Get libraries first
        libraries = jellyfin_service.get_libraries()
        if not libraries:
            return {"error": "No libraries found"}
        
        # Get movies from the first library
        library_id = libraries[0]['id']
        params = {
            'IncludeItemTypes': 'Movie',
            'Recursive': 'true',
            'Fields': 'ProviderIds',
            'ImageTypeLimit': '0',
            'ParentId': library_id,
            'Limit': '5'  # Just get 5 movies
        }
        
        response = jellyfin_service.session.get(f"{jellyfin_service.server_url}/Items", params=params)
        if response.status_code == 200:
            data = response.json()
            items = data.get('Items', [])
            
            debug_data = []
            for item in items:
                provider_ids = item.get('ProviderIds', {})
                debug_data.append({
                    'name': item.get('Name'),
                    'id': item.get('Id'),
                    'provider_ids': provider_ids,
                    'provider_keys': list(provider_ids.keys()) if provider_ids else [],
                    'has_imdb': 'Imdb' in provider_ids or 'imdb' in provider_ids or 'IMDB' in provider_ids
                })
            
            return {
                "sample_movies": debug_data,
                "total_items": len(items),
                "library_used": libraries[0]['name']
            }
        else:
            return {"error": f"Failed to get items: {response.status_code}"}
            
    except Exception as e:
        logger.error(f"Debug provider IDs failed: {e}")
        return {"error": str(e)}

# Release checking and notification endpoints
@api_router.post("/admin/check-releases")
@limiter.limit("1/hour")
def trigger_release_check(request: Request, current_user: User = Depends(get_current_admin_user)):
    """Manually trigger a release check (admin only)"""
    try:
        from release_checker import ReleaseChecker
        checker = ReleaseChecker()
        results = checker.run_full_check()
        return {
            "success": True,
            "message": f"Release check complete. Found {results['new_episodes']} new episodes and {results['new_movies']} new movies.",
            "results": results
        }
    except Exception as e:
        return {"error": f"Release check failed: {str(e)}"}, 500

@api_router.get("/notifications/new-releases")
def get_new_releases():
    """Get new releases for notification badges"""
    try:
        with Session(engine) as session:
            # Get new movies (SQLite stores booleans as integers)
            new_movies = session.exec(
                select(Movie).where(Movie.is_new == 1)
            ).all()
            
            # Get series with new episodes (SQLite stores booleans as integers)
            new_series = session.exec(
                select(Series).where(Series.is_new == 1)
            ).all()
            
            # Count new episodes
            new_episode_count = 0
            for series in new_series:
                episodes = session.exec(
                    select(Episode).where(Episode.series_id == series.id)
                ).all()
                new_episode_count += len(episodes)
            
            return {
                "new_movies": len(new_movies),
                "new_series": len(new_series),
                "new_episodes": new_episode_count,
                "total_new_items": len(new_movies) + new_episode_count
            }
    except Exception as e:
        return {"error": f"Failed to get new releases: {str(e)}"}, 500

@api_router.post("/notifications/mark-seen")
def mark_notifications_seen():
    """Mark all new releases as seen (clear notification badges)"""
    try:
        with Session(engine) as session:
            # Mark all new movies as seen (SQLite stores booleans as integers)
            session.exec(
                "UPDATE movie SET is_new = 0 WHERE is_new = 1"
            )
            
            # Mark all new series as seen (SQLite stores booleans as integers)
            session.exec(
                "UPDATE series SET is_new = 0 WHERE is_new = 1"
            )
            
            session.commit()
            return {"success": True, "message": "All notifications marked as seen"}
    except Exception as e:
        return {"error": f"Failed to mark notifications as seen: {str(e)}"}, 500

@api_router.get("/notifications/details")
def get_notification_details(current_user: User = Depends(get_current_user)):
    """Get detailed information about new releases and newly imported content"""
    try:
        with Session(engine) as session:
            # Get newly discovered content (from nightly cron)
            new_movies = session.exec(
                select(Movie).where(
                    Movie.user_id == current_user.id,
                    Movie.is_new == 1,
                    Movie.deleted == False
                )
            ).all()
            
            new_series = session.exec(
                select(Series).where(
                    Series.user_id == current_user.id,
                    Series.is_new == 1,
                    Series.deleted == False
                )
            ).all()
            
            # Get newly imported content (within last 24 hours)
            one_day_ago = datetime.now(timezone.utc) - timedelta(days=1)
            newly_imported_movies = session.exec(
                select(Movie).where(
                    Movie.user_id == current_user.id,
                    Movie.imported_at >= one_day_ago,
                    Movie.deleted == False
                )
            ).all()
            
            newly_imported_series = session.exec(
                select(Series).where(
                    Series.user_id == current_user.id,
                    Series.imported_at >= one_day_ago,
                    Series.deleted == False
                )
            ).all()
            
            # Get episodes for new series
            series_details = []
            for series in new_series:
                episodes = session.exec(
                    select(Episode).where(Episode.series_id == series.id)
                ).all()
                series_details.append({
                    "series": {
                        "id": series.id,
                        "title": series.title,
                        "imdb_id": series.imdb_id,
                        "poster_url": series.poster_url
                    },
                    "episodes": [
                        {
                            "id": ep.id,
                            "title": ep.title,
                            "code": ep.code,
                            "air_date": ep.air_date
                        } for ep in episodes
                    ]
                })
            
            return {
                "new_movies": [
                    {
                        "id": movie.id,
                        "title": movie.title,
                        "imdb_id": movie.imdb_id,
                        "release_date": movie.release_date,
                        "collection_name": movie.collection_name,
                        "poster_url": movie.poster_url
                    } for movie in new_movies
                ],
                "new_series": series_details,
                "newly_imported_movies": [
                    {
                        "id": movie.id,
                        "title": movie.title,
                        "imdb_id": movie.imdb_id,
                        "release_date": movie.release_date,
                        "collection_name": movie.collection_name,
                        "poster_url": movie.poster_url,
                        "imported_at": movie.imported_at.isoformat() if movie.imported_at else None
                    } for movie in newly_imported_movies
                ],
                "newly_imported_series": [
                    {
                        "id": series.id,
                        "title": series.title,
                        "imdb_id": series.imdb_id,
                        "poster_url": series.poster_url,
                        "imported_at": series.imported_at.isoformat() if series.imported_at else None
                    } for series in newly_imported_series
                ]
            }
    except Exception as e:
        return {"error": f"Failed to get notification details: {str(e)}"}, 500

# Serve the frontend HTML at root and /login
@app.get("/")
def read_root():
    return FileResponse("static/index.html")

@app.get("/login")
def read_login():
    return FileResponse("static/login.html")

@api_router.get("/debug/movies")
def debug_movies():
    """Debug endpoint to see all movies in database with collection info"""
    try:
        with Session(engine) as session:
            movies = session.exec(select(Movie)).all()
            movie_data = []
            for movie in movies:
                movie_data.append({
                    "id": movie.id,
                    "title": movie.title,
                    "imdb_id": movie.imdb_id,
                    "collection_id": movie.collection_id,
                    "collection_name": movie.collection_name,
                    "watched": movie.watched,
                    "quality": getattr(movie, 'quality', None)
                })
            return {
                "total_movies": len(movie_data),
                "movies": movie_data
            }
    except Exception as e:
        return {"error": str(e)}

@api_router.get("/version")
def get_version():
    """Simple endpoint to check if we're running the latest version"""
    return {
        "version": "automated-import-features",
        "has_debug_endpoint": True,
        "has_automated_import": True,
        "timestamp": "2025-08-22"
    }

@api_router.post("/admin/trigger-automated-import")
async def trigger_automated_import(current_user: User = Depends(get_current_admin_user)):
    """Manually trigger the automated import checker (admin only)"""
    try:
        logger.info("Admin triggered automated import check")
        
                # Import and run the automated import checker
        from automated_import_checker import main as run_automated_import
        
        # Run in a separate thread to avoid blocking
        import threading
        thread = threading.Thread(target=run_automated_import)
        thread.daemon = True
        thread.start()
        
        return {
            "success": True,
            "message": "Automated import check started in background",
            "note": "Check logs for results"
        }
    except Exception as e:
        logger.error(f"Failed to trigger automated import: {e}")
        return {"error": f"Failed to trigger automated import: {str(e)}"}, 500

@api_router.get("/admin/library-import-history")
async def get_library_import_history(current_user: User = Depends(get_current_admin_user)):
    """Get library import history for all users (admin only)"""
    try:
        with Session(engine) as session:
            # Get all library import history
            history = session.exec(
                select(LibraryImportHistory).where(
                    LibraryImportHistory.deleted == False
                ).order_by(LibraryImportHistory.last_imported.desc())
            ).all()
            
            return {
                "success": True,
                "history": [
                    {
                        "id": h.id,
                        "user_id": h.user_id,
                        "library_name": h.library_name,
                        "library_id": h.library_id,
                        "last_imported": h.last_imported.isoformat() if h.last_imported else None,
                        "import_count": h.import_count,
                        "is_automated": h.is_automated,
                        "created_at": h.created_at.isoformat() if h.created_at else None
                    } for h in history
                ]
            }
    except Exception as e:
        logger.error(f"Failed to get library import history: {e}")
        return {"error": f"Failed to get library import history: {str(e)}"}, 500

@api_router.get("/library-import-history")
async def get_user_library_import_history(current_user: User = Depends(get_current_user)):
    """Get library import history for the current user"""
    try:
        with Session(engine) as session:
            # Get library import history for current user
            history = session.exec(
                select(LibraryImportHistory).where(
                    LibraryImportHistory.user_id == current_user.id,
                    LibraryImportHistory.deleted == False
                ).order_by(LibraryImportHistory.last_imported.desc())
            ).all()
            
            return {
                "success": True,
                "history": [
                    {
                        "id": h.id,
                        "library_name": h.library_name,
                        "library_id": h.library_id,
                        "last_imported": h.last_imported.isoformat() if h.last_imported else None,
                        "import_count": h.import_count,
                        "is_automated": h.is_automated,
                        "created_at": h.created_at.isoformat() if h.created_at else None
                    } for h in history
                ]
            }
    except Exception as e:
        logger.error(f"Failed to get user library import history: {e}")
        return {"error": f"Failed to get library import history: {str(e)}"}, 500

@api_router.post("/library-import-history/{history_id}/toggle-automation")
async def toggle_library_automation(history_id: int, current_user: User = Depends(get_current_user)):
    """Toggle automated imports for a specific library"""
    try:
        with Session(engine) as session:
            # Get the library import history
            history = session.exec(
                select(LibraryImportHistory).where(
                    LibraryImportHistory.id == history_id,
                    LibraryImportHistory.user_id == current_user.id,
                    LibraryImportHistory.deleted == False
                )
            ).first()
            
            if not history:
                return {"error": "Library import history not found"}, 404
            
            # Toggle the automation flag
            history.is_automated = not history.is_automated
            history.updated_at = datetime.now(timezone.utc)
            session.add(history)
            session.commit()
            
            return {
                "success": True,
                "message": f"Automated imports {'enabled' if history.is_automated else 'disabled'} for {history.library_name}",
                "is_automated": history.is_automated
            }
    except Exception as e:
        logger.error(f"Failed to toggle library automation: {e}")
        return {"error": f"Failed to toggle library automation: {str(e)}"}, 500

@api_router.get("/admin/progress-performance")
async def get_progress_performance(current_user: User = Depends(get_current_admin_user)):
    """Get progress tracking performance data (admin only)"""
    try:
        from progress_tracker import progress_tracker
        performance_data = progress_tracker.get_performance_summary()
        return {
            "success": True,
            "performance": performance_data
        }
    except Exception as e:
        logger.error(f"Failed to get progress performance: {e}")
        return {"error": f"Failed to get progress performance: {str(e)}"}, 500

# ============================================================================
# LIST MANAGEMENT API ENDPOINTS
# ============================================================================

@api_router.get("/lists")
def get_user_lists(current_user: User = Depends(get_current_user)):
    """Get all lists for the current user"""
    print(f"DEBUG: get_user_lists called for user: {current_user.username}")
    try:
        # Create a fresh database session
        with Session(engine) as session:
            print("DEBUG: Session created successfully")
            # Get user's own lists
            print("DEBUG: Getting user's own lists...")
            # Use a more defensive query approach
            user_lists_query = text("""
                SELECT id, user_id, name, description, type, color, background_color, icon, 
                       is_active, created_at, updated_at, deleted
                FROM list 
                WHERE user_id = :user_id AND deleted = 0
            """)
            user_lists_result = session.execute(user_lists_query, {"user_id": current_user.id}).fetchall()
            
            # Convert to List objects manually
            user_lists = []
            for row in user_lists_result:
                user_list = List(
                    id=row[0],
                    user_id=row[1], 
                    name=row[2],
                    description=row[3],
                    type=row[4],
                    color=row[5],
                    background_color=row[6],
                    icon=row[7],
                    is_active=row[8],
                    created_at=row[9],
                    updated_at=row[10],
                    deleted=row[11]
                )
                user_lists.append(user_list)
            print(f"DEBUG: Found {len(user_lists)} user lists")
            
            # Get shared lists where user has access (defensive approach)
            try:
                print("DEBUG: Getting shared lists...")
                shared_lists_query = text("""
                    SELECT l.id, l.user_id, l.name, l.description, l.type, l.color, l.background_color, l.icon, 
                           l.is_active, l.created_at, l.updated_at, l.deleted
                    FROM list l
                    JOIN listpermission lp ON l.id = lp.list_id
                    WHERE lp.shared_with_user_id = :user_id 
                    AND lp.deleted = 0 
                    AND l.deleted = 0
                """)
                shared_lists_result = session.execute(shared_lists_query, {"user_id": current_user.id}).fetchall()
                
                # Convert to List objects manually
                shared_lists = []
                for row in shared_lists_result:
                    shared_list = List(
                        id=row[0],
                        user_id=row[1], 
                        name=row[2],
                        description=row[3],
                        type=row[4],
                        color=row[5],
                        background_color=row[6],
                        icon=row[7],
                        is_active=row[8],
                        created_at=row[9],
                        updated_at=row[10],
                        deleted=row[11]
                    )
                    shared_lists.append(shared_list)
                print(f"DEBUG: Found {len(shared_lists)} shared lists")
            except Exception as e:
                print(f"DEBUG: Error getting shared lists: {e}")
                shared_lists = []  # Fallback to empty list if shared lists fail
            
            # Combine and format lists
            all_lists = []
            
            # Add personal list (always exists)
            personal_list = {
                "id": "personal",
                "name": "My Watchlist",
                "description": "Your personal watchlist",
                "type": "personal",
                "color": "#007AFF",
                "icon": "📱",
                "is_active": True,
                "item_count": 0,  # Will be calculated below
                "created_at": datetime.now(timezone.utc),
                "owner": current_user.username
            }
            
            # Calculate item count for personal watchlist - INDIVIDUAL ITEMS ONLY
            # Collections are just organizational folders, not countable items
            # Count: unwatched movies + unwatched series
            
            # Count unwatched movies (including those in collections)
            unwatched_movies = len(session.exec(
                select(Movie).where(
                    Movie.user_id == current_user.id, 
                    Movie.deleted == False,
                    Movie.watched == False
                )
            ).all())
            
            # Count series with unwatched episodes
            unwatched_series = 0
            series_list = session.exec(
                select(Series).where(Series.user_id == current_user.id, Series.deleted == False)
            ).all()
            
            for series in series_list:
                episodes = session.exec(
                    select(Episode).where(Episode.series_id == series.id)
                ).all()
                if episodes:
                    # Series is unwatched if any episode is unwatched
                    if any(not ep.watched for ep in episodes):
                        unwatched_series += 1
                else:
                    # Series with no episodes counts as unwatched
                    unwatched_series += 1
            
            # Total unwatched items (movies + series only)
            total_unwatched = unwatched_movies + unwatched_series
            
            print(f"DEBUG: Personal watchlist count - Movies: {unwatched_movies}, Series: {unwatched_series}, Total: {total_unwatched}")
            
            personal_list["item_count"] = total_unwatched
            
            all_lists.append(personal_list)
            
            # Add custom lists
            for user_list in user_lists:
                # Calculate item count for this list - only count valid items
                # This ensures consistency with what's actually returned by get_list_items
                valid_items = session.exec(
                    select(ListItem).where(
                        ListItem.list_id == user_list.id,
                        ListItem.deleted == False
                    )
                ).all()
                
                # Filter out items that don't have valid corresponding movies/series
                # Only count UNWATCHED items for more useful counts
                unwatched_count = 0
                for item in valid_items:
                    if item.item_type == "movie":
                        movie = session.exec(
                            select(Movie).where(
                                Movie.id == item.item_id,
                                Movie.deleted == False,
                                Movie.user_id == current_user.id
                            )
                        ).first()
                        if movie and not item.watched:  # Only count unwatched movies
                            unwatched_count += 1
                    elif item.item_type == "series":
                        series = session.exec(
                            select(Series).where(
                                Series.id == item.item_id,
                                Series.deleted == False,
                                Series.user_id == current_user.id
                            )
                        ).first()
                        if series and not item.watched:  # Only count unwatched series
                            unwatched_count += 1
                    elif item.item_type == "collection":
                        # For collections, we'd need to check if the collection exists
                        # For now, count them as valid (could be enhanced later)
                        unwatched_count += 1
                
                all_lists.append({
                    "id": user_list.id,
                    "name": user_list.name,
                    "description": user_list.description,
                    "type": user_list.type,
                    "color": user_list.color or "#007AFF",
                    "icon": user_list.icon or "📋",
                    "is_active": user_list.is_active,
                    "item_count": unwatched_count,  # Use the unwatched count
                    "created_at": user_list.created_at,
                    "owner": current_user.username
                })
            
            # Add shared lists
            for shared_list in shared_lists:
                # Calculate item count for this list
                item_count = len(session.exec(
                    select(ListItem).where(
                        ListItem.list_id == shared_list.id,
                        ListItem.deleted == False
                    )
                ).all())
                
                # Get the owner's username
                owner = session.exec(
                    select(User).where(User.id == shared_list.user_id)
                ).first()
                owner_username = owner.username if owner else "Unknown"
                
                # Get permission level for this user
                permission = session.exec(
                    select(ListPermission).where(
                        ListPermission.list_id == shared_list.id,
                        ListPermission.shared_with_user_id == current_user.id,
                        ListPermission.deleted == False
                    )
                ).first()
                permission_level = permission.permission_level if permission else "view"
                
                all_lists.append({
                    "id": shared_list.id,
                    "name": shared_list.name,
                    "description": shared_list.description,
                    "type": "shared",
                    "color": shared_list.color or "#007AFF",
                    "icon": shared_list.icon or "🔗",
                    "is_active": shared_list.is_active,
                    "item_count": item_count,
                    "created_at": shared_list.created_at,
                    "owner": owner_username,
                    "permission": permission_level
                })
            
            return {"lists": all_lists}
            
    except Exception as e:
        import traceback
        print(f"Error getting user lists: {e}")
        print(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get lists: {str(e)}")

@api_router.post("/lists")
def create_list(
    list_data: ListCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new list for the current user"""
    try:
        with Session(engine) as session:
            # Check if list name already exists for this user
            existing_list = session.exec(
                select(List).where(
                    List.user_id == current_user.id,
                    List.name == list_data.name,
                    List.deleted == False
                )
            ).first()
            
            if existing_list:
                raise HTTPException(
                    status_code=400,
                    detail="A list with this name already exists"
                )
            
            # Create new list
            new_list = List(
                user_id=current_user.id,
                name=list_data.name,
                description=list_data.description,
                type="custom",
                color=list_data.color or "#007AFF",
                icon=list_data.icon or "📋"
            )
            
            session.add(new_list)
            session.commit()
            session.refresh(new_list)
            
            return {
                "id": new_list.id,
                "name": new_list.name,
                "description": new_list.description,
                "type": new_list.type,
                "color": new_list.color,
                "icon": new_list.icon,
                "is_active": new_list.is_active,
                "item_count": 0,
                "created_at": new_list.created_at,
                "owner": current_user.username
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create list: {str(e)}")

@api_router.put("/lists/{list_id}")
def update_list(
    list_id: int,
    list_data: ListUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update an existing list"""
    try:
        with Session(engine) as session:
            # Get the list and verify ownership
            user_list = session.exec(
                select(List).where(
                    List.id == list_id,
                    List.user_id == current_user.id,
                    List.deleted == False
                )
            ).first()
            
            if not user_list:
                raise HTTPException(status_code=404, detail="List not found")
            
            # Update fields if provided
            if list_data.name is not None:
                user_list.name = list_data.name
            if list_data.description is not None:
                user_list.description = list_data.description
            if list_data.color is not None:
                user_list.color = list_data.color
            if list_data.icon is not None:
                user_list.icon = list_data.icon
            
            user_list.updated_at = datetime.now(timezone.utc)
            
            session.add(user_list)
            session.commit()
            session.refresh(user_list)
            
            return {
                "id": user_list.id,
                "name": user_list.name,
                "description": user_list.description,
                "type": user_list.type,
                "color": user_list.color,
                "icon": user_list.icon,
                "is_active": user_list.is_active,
                "created_at": user_list.created_at,
                "updated_at": user_list.updated_at
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update list: {str(e)}")

@api_router.delete("/lists/{list_id}")
def delete_list(
    list_id: int,
    current_user: User = Depends(get_current_user)
):
    """Delete a list (soft delete)"""
    try:
        with Session(engine) as session:
            # Get the list and verify ownership
            user_list = session.exec(
                select(List).where(
                    List.id == list_id,
                    List.user_id == current_user.id,
                    List.deleted == False
                )
            ).first()
            
            if not user_list:
                raise HTTPException(status_code=404, detail="List not found")
            
            # Soft delete the list
            user_list.deleted = True
            user_list.updated_at = datetime.now(timezone.utc)
            
            # Soft delete all list items
            list_items = session.exec(
                select(ListItem).where(
                    ListItem.list_id == list_id,
                    ListItem.deleted == False
                )
            ).all()
            
            for item in list_items:
                item.deleted = True
            
            session.add(user_list)
            session.add_all(list_items)
            session.commit()
            
            return {"message": "List deleted successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete list: {str(e)}")

@api_router.get("/lists/{list_id}/items")
def get_list_items(
    list_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all items in a specific list"""
    try:
        with Session(engine) as session:
            # Handle personal list specially
            if list_id == "personal":
                # Return the main watchlist data
                return get_watchlist(current_user)
            
            # For custom lists, get list items
            list_id_int = int(list_id)
            
            # Verify user has access to this list
            user_list = session.exec(
                select(List).where(
                    List.id == list_id_int,
                    List.deleted == False
                )
            ).first()
            
            if not user_list:
                raise HTTPException(status_code=404, detail="List not found")
            
            # Check if user owns the list or has shared access
            if user_list.user_id != current_user.id:
                # Check shared access
                shared_access = session.exec(
                    select(ListPermission).where(
                        ListPermission.list_id == list_id_int,
                        ListPermission.shared_with_user_id == current_user.id,
                        ListPermission.deleted == False
                    )
                ).first()
                
                if not shared_access:
                    raise HTTPException(status_code=403, detail="Access denied")
            
            # Get list items
            list_items = session.exec(
                select(ListItem).where(
                    ListItem.list_id == list_id_int,
                    ListItem.deleted == False
                )
            ).all()
            
            # Group items by type and fetch full data
            movies = []
            series = []
            collections = {}
            
            for item in list_items:
                if item.item_type == "movie":
                    movie = session.exec(
                        select(Movie).where(
                            Movie.id == item.item_id,
                            Movie.deleted == False
                        )
                    ).first()
                    
                    if movie:
                        movies.append({
                            "id": movie.id,
                            "title": movie.title,
                            "imdb_id": movie.imdb_id,
                            "release_date": movie.release_date,
                            "watched": item.watched,  # Use list-specific watched status
                            "type": movie.type,
                            "collection_id": movie.collection_id,
                            "collection_name": movie.collection_name,
                            "poster_url": movie.poster_url,
                            "quality": getattr(movie, 'quality', None),
                            "runtime": getattr(movie, 'runtime', None),  # Add runtime for consistency
                            "overview": getattr(movie, 'overview', None),  # Movie description from TMDB
                            "notes": item.notes,  # List-specific notes
                            "added_at": item.added_at,
                            "imported_at": getattr(movie, 'imported_at', None),  # Add imported_at for "Newly Imported" badges
                            "is_new": getattr(movie, 'is_new', False),  # Add is_new for consistency
                            "watched_by": item.watched_by
                        })
                
                elif item.item_type == "series":
                    series_obj = session.exec(
                        select(Series).where(
                            Series.id == item.item_id,
                            Series.deleted == False
                        )
                    ).first()
                    
                    if series_obj:
                        # Get episodes for this series
                        episodes = session.exec(
                            select(Episode).where(
                                Episode.series_id == series_obj.id,
                                Episode.deleted == False
                            )
                        ).all()
                        
                        series.append({
                            "id": series_obj.id,
                            "title": series_obj.title,
                            "imdb_id": series_obj.imdb_id,
                            "poster_url": series_obj.poster_url,
                            "average_episode_runtime": series_obj.average_episode_runtime,
                            "notes": item.notes,  # List-specific notes
                            "added_at": item.added_at,
                            "episodes": [
                                {
                                    "id": ep.id,
                                    "season": ep.season,
                                    "episode": ep.episode,
                                    "title": ep.title,
                                    "code": ep.code,
                                    "air_date": ep.air_date,
                                    "watched": ep.watched,
                                    "notes": ep.notes
                                } for ep in episodes
                            ]
                        })
            
            # Group movies by collection if any
            for movie in movies:
                if movie["collection_id"]:
                    if movie["collection_id"] not in collections:
                        collections[movie["collection_id"]] = {
                            "id": movie["collection_id"],
                            "name": movie["collection_name"],
                            "poster_url": movie["poster_url"],
                            "movies": []
                        }
                    collections[movie["collection_id"]] ["movies"].append(movie)
            
            # Separate standalone movies
            standalone_movies = [m for m in movies if not m["collection_id"]]
            
            return {
                "movies": standalone_movies,
                "series": series,
                "collections": list(collections.values())
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting list items: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get list items: {str(e)}")

@api_router.post("/lists/{list_id}/items")
def add_item_to_list(
    list_id: int,
    item_data: ListItemAdd,
    current_user: User = Depends(get_current_user)
):
    """Add an item to a list"""
    try:
        with Session(engine) as session:
            # Verify user owns the list
            user_list = session.exec(
                select(List).where(
                    List.id == list_id,
                    List.user_id == current_user.id,
                    List.deleted == False
                )
            ).first()
            
            if not user_list:
                raise HTTPException(status_code=404, detail="List not found")
            
            # Check if item already exists in list
            existing_item = session.exec(
                select(ListItem).where(
                    ListItem.list_id == list_id,
                    ListItem.item_type == item_data.item_type,
                    ListItem.item_id == item_data.item_id,
                    ListItem.deleted == False
                )
            ).first()
            
            if existing_item:
                raise HTTPException(
                    status_code=400,
                    detail="Item already exists in this list"
                )
            
            # Create new list item
            new_item = ListItem(
                list_id=list_id,
                item_type=item_data.item_type,
                item_id=item_data.item_id,
                notes=item_data.notes
            )
            
            session.add(new_item)
            session.commit()
            
            return {"message": "Item added to list successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error adding item to list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add item to list: {str(e)}")

@api_router.delete("/lists/{list_id}/items/{item_id}")
def remove_item_from_list(
    list_id: int,
    item_id: int,
    current_user: User = Depends(get_current_user)
):
    """Remove an item from a list"""
    try:
        with Session(engine) as session:
            # Verify user owns the list
            user_list = session.exec(
                select(List).where(
                    List.id == list_id,
                    List.user_id == current_user.id,
                    List.deleted == False
                )
            ).first()
            
            if not user_list:
                raise HTTPException(status_code=404, detail="List not found")
            
            # Find and soft delete the list item
            list_item = session.exec(
                select(ListItem).where(
                    ListItem.list_id == list_id,
                    ListItem.item_id == item_id,
                    ListItem.deleted == False
                )
            ).first()
            
            if not list_item:
                raise HTTPException(status_code=404, detail="Item not found in list")
            
            list_item.deleted = True
            session.add(list_item)
            session.commit()
            
            return {"message": "Item removed from list successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing item from list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove item from list: {str(e)}")

@api_router.patch("/lists/{list_id}/items/{item_id}/watched")
def toggle_item_watched_in_list(
    list_id: int,
    item_id: int,
    watched_data: ListItemUpdate,
    current_user: User = Depends(get_current_user)
):
    """Toggle watched status of an item in a list"""
    try:
        with Session(engine) as session:
            # Verify user has access to the list
            user_list = session.exec(
                select(List).where(
                    List.id == list_id,
                    List.deleted == False
                )
            ).first()
            
            if not user_list:
                raise HTTPException(status_code=404, detail="List not found")
            
            # Check if user owns the list or has shared access
            if user_list.user_id != current_user.id:
                # Check shared access
                shared_access = session.exec(
                    select(ListPermission).where(
                        ListPermission.list_id == list_id,
                        ListPermission.shared_with_user_id == current_user.id,
                        ListPermission.deleted == False
                    )
                ).first()
                
                if not shared_access:
                    raise HTTPException(status_code=403, detail="Access denied")
            
            # Find the list item
            list_item = session.exec(
                select(ListItem).where(
                    ListItem.list_id == list_id,
                    ListItem.item_id == item_id,
                    ListItem.deleted == False
                )
            ).first()
            
            if not list_item:
                raise HTTPException(status_code=404, detail="Item not found in list")
            
            # Update watched status
            if watched_data.watched is not None:
                list_item.watched = watched_data.watched
                if watched_data.watched:
                    list_item.watched_at = datetime.now(timezone.utc)
                    list_item.watched_by = watched_data.watched_by or "you"
                else:
                    list_item.watched_at = None
                    list_item.watched_by = "you"
            
            if watched_data.notes is not None:
                list_item.notes = watched_data.notes
            
            session.add(list_item)
            session.commit()
            
            return {"message": "Item updated successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating item in list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update item: {str(e)}")

# ============================================================================
# LIST SHARING API ENDPOINTS
# ============================================================================

@api_router.post("/lists/{list_id}/share")
def share_list(
    list_id: int,
    share_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Share a list with another user"""
    try:
        username = share_data.get('username')
        permission = share_data.get('permission', 'view')
        
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        
        if permission not in ['view', 'edit']:
            raise HTTPException(status_code=400, detail="Permission must be 'view' or 'edit'")
        
        with Session(engine) as session:
            # Verify the list exists and user owns it
            user_list = session.exec(
                select(List).where(
                    List.id == list_id,
                    List.user_id == current_user.id,
                    List.deleted == False
                )
            ).first()
            
            if not user_list:
                raise HTTPException(status_code=404, detail="List not found or you don't have permission to share it")
            
            # Find the target user
            target_user = session.exec(
                select(User).where(User.username == username)
            ).first()
            
            if not target_user:
                raise HTTPException(status_code=404, detail=f"User '{username}' not found")
            
            if target_user.id == current_user.id:
                raise HTTPException(status_code=400, detail="Cannot share list with yourself")
            
            # Check if list is already shared with this user
            existing_share = session.exec(
                select(ListPermission).where(
                    ListPermission.list_id == list_id,
                    ListPermission.shared_with_user_id == target_user.id,
                    ListPermission.deleted == False
                )
            ).first()
            
            if existing_share:
                # Update existing share
                existing_share.permission_level = permission
                existing_share.updated_at = datetime.now(timezone.utc)
                session.add(existing_share)
                session.commit()
                return {"message": f"Updated sharing permissions for {username}"}
            else:
                # Create new share
                new_share = ListPermission(
                    list_id=list_id,
                    shared_with_user_id=target_user.id,
                    permission_level=permission
                )
                session.add(new_share)
                session.commit()
                return {"message": f"List shared successfully with {username}"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sharing list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to share list: {str(e)}")

@api_router.delete("/lists/{list_id}/unshare")
def unshare_list(
    list_id: int,
    current_user: User = Depends(get_current_user)
):
    """Remove shared access to a list (for the user who received the share)"""
    try:
        with Session(engine) as session:
            # Find the share record for this user
            share_record = session.exec(
                select(ListPermission).where(
                    ListPermission.list_id == list_id,
                    ListPermission.shared_with_user_id == current_user.id,
                    ListPermission.deleted == False
                )
            ).first()
            
            if not share_record:
                raise HTTPException(status_code=404, detail="Shared list not found")
            
            # Soft delete the share record
            share_record.deleted = True
            session.add(share_record)
            session.commit()
            
            return {"message": "Shared list access removed successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error unsharing list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to unshare list: {str(e)}")

@app.get("/admin")
def admin_console(current_user: User = Depends(get_current_admin_user)):
    """Serve the admin console HTML - admin users only"""
    return FileResponse("static/admin.html")

# Admin API endpoints
@api_router.get("/admin/users")
def get_admin_users(current_user: User = Depends(get_current_admin_user)):
    """Get all users for admin management"""
    try:
        print(f"Admin users request from user: {current_user.username}")
        with Session(engine) as session:
            print("Database session created successfully")
            # Get all active users with their item counts
            users = []
            active_users = session.exec(select(User).where(User.is_active == True)).all()
            print(f"Found {len(active_users)} active users")
            
            for user in active_users:
                print(f"Processing user: {user.username}")
                # Count user's items
                movie_count = len(session.exec(select(Movie).where(Movie.user_id == user.id, Movie.deleted == False)).all())
                series_count = len(session.exec(select(Series).where(Series.user_id == user.id, Series.deleted == False)).all())
                list_count = len(session.exec(select(List).where(List.user_id == user.id, List.deleted == False)).all())
                
                users.append({
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "is_admin": user.is_admin,
                    "is_active": user.is_active,
                    "movie_count": movie_count,
                    "series_count": series_count,
                    "list_count": list_count
                })
            
            print(f"Returning {len(users)} users")
            return {"users": users}
    except Exception as e:
        print(f"Error getting admin users: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get users: {str(e)}")

@api_router.get("/admin/users/{user_id}")
def get_admin_user(user_id: int, current_user: User = Depends(get_current_admin_user)):
    """Get specific user details for admin management"""
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.id == user_id)).first()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Count user's items
            movie_count = len(session.exec(select(Movie).where(Movie.user_id == user.id, Movie.deleted == False)).all())
            series_count = len(session.exec(select(Series).where(Series.user_id == user.id, Series.deleted == False)).all())
            
            return {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_active": user.is_active,
                "is_admin": user.is_admin,
                "item_count": movie_count + series_count
            }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting admin user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")

@api_router.put("/admin/users/{user_id}")
def update_admin_user(
    user_id: int, 
    user_data: dict,
    current_user: User = Depends(get_current_admin_user)
):
    """Update user details (admin only)"""
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.id == user_id)).first()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Update allowed fields
            if 'is_active' in user_data:
                user.is_active = user_data['is_active']
            if 'is_admin' in user_data:
                user.is_admin = user_data['is_admin']
            
            session.add(user)
            session.commit()
            
            return {"message": "User updated successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating admin user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

@api_router.post("/admin/users/{user_id}/clear-data")
def clear_user_data(user_id: int, current_user: User = Depends(get_current_admin_user)):
    """Clear all data for a specific user (admin only)"""
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.id == user_id)).first()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Soft delete all user's movies
            movies = session.exec(select(Movie).where(Movie.user_id == user_id, Movie.deleted == False)).all()
            for movie in movies:
                movie.deleted = True
                session.add(movie)
            
            # Soft delete all user's series
            series = session.exec(select(Series).where(Series.user_id == user_id, Series.deleted == False)).all()
            for series_item in series:
                series_item.deleted = True
                session.add(series_item)
                
                # Soft delete episodes
                episodes = session.exec(select(Episode).where(Episode.series_id == series_item.id, Episode.deleted == False)).all()
                for episode in episodes:
                    episode.deleted = True
                    session.add(episode)
            
            # Soft delete all user's lists
            lists = session.exec(select(List).where(List.user_id == user_id, List.deleted == False)).all()
            for list_item in lists:
                list_item.deleted = True
                session.add(list_item)
                
                # Soft delete list items
                list_items = session.exec(select(ListItem).where(ListItem.list_id == list_item.id, ListItem.deleted == False)).all()
                for item in list_items:
                    item.deleted = True
                    session.add(item)
            
            session.commit()
            
            return {"message": f"All data cleared for user {user.username}"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error clearing user data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear user data: {str(e)}")

@api_router.post("/admin/users/{user_id}/reset-password")
def reset_user_password(user_id: int, current_user: User = Depends(get_current_admin_user)):
    """Reset user password to default (admin only)"""
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.id == user_id)).first()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Reset to default password (you can change this)
            default_password = "changeme123"
            user.hashed_password = get_password_hash(default_password)
            
            session.add(user)
            session.commit()
            
            return {"message": f"Password reset for user {user.username} to: {default_password}"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error resetting user password: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset password: {str(e)}")

@api_router.delete("/admin/users/{user_id}")
def delete_admin_user(user_id: int, current_user: User = Depends(get_current_admin_user)):
    """Hard delete a user and all their data (admin only)"""
    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.id == user_id)).first()
            
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Don't allow admin to delete themselves
            if user_id == current_user.id:
                raise HTTPException(status_code=400, detail="Cannot delete your own account")
            
            # Delete all user's data first (in reverse dependency order)
            
            # Delete list items first
            list_items = session.exec(select(ListItem).where(ListItem.list_id.in_(
                select(List.id).where(List.user_id == user_id)
            ))).all()
            for item in list_items:
                session.delete(item)
            
            # Delete lists
            lists = session.exec(select(List).where(List.user_id == user_id)).all()
            for list_item in lists:
                session.delete(list_item)
            
            # Delete episodes first (they reference series)
            episodes = session.exec(select(Episode).where(Episode.series_id.in_(
                select(Series.id).where(Series.user_id == user_id)
            ))).all()
            for episode in episodes:
                session.delete(episode)
            
            # Delete series
            series = session.exec(select(Series).where(Series.user_id == user_id)).all()
            for series_item in series:
                session.delete(series_item)
            
            # Delete movies
            movies = session.exec(select(Movie).where(Movie.user_id == user_id)).all()
            for movie in movies:
                session.delete(movie)
            
            # Finally, delete the user
            session.delete(user)
            
            session.commit()
            
            return {"message": f"User {user.username} and all their data have been permanently deleted"}
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting admin user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

@api_router.get("/admin/dashboard")
def get_admin_dashboard(current_user: User = Depends(get_current_admin_user)):
    """Get admin dashboard statistics
    
    NOTE: This function provides global system statistics for admin monitoring.
    Individual user operations properly respect user boundaries and soft deletes.
    """
    try:
        print(f"Admin dashboard request from user: {current_user.username}")
        with Session(engine) as session:
            print("Database session created successfully")
            # Count total users
            total_users = len(session.exec(select(User).where(User.is_active == True)).all())
            print(f"Total active users: {total_users}")
            
            # Count total movies and series (global stats for admin monitoring)
            # NOTE: These are global counts for system monitoring only
            # Individual user queries properly filter by user_id + deleted status
            total_movies = len(session.exec(select(Movie).where(Movie.deleted == False)).all())
            total_series = len(session.exec(select(Series).where(Series.deleted == False)).all())
            print(f"Total movies: {total_movies}, Total series: {total_series}")
            
            # Count admin users
            admin_users = len(session.exec(select(User).where(User.is_admin == True, User.is_active == True)).all())
            print(f"Total admin users: {admin_users}")
            
            result = {
                "total_users": total_users,
                "total_movies": total_movies,
                "total_series": total_series,
                "admin_users": admin_users
            }
            print(f"Dashboard result: {result}")
            return result
    except Exception as e:
        print(f"Error getting admin dashboard: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard data: {str(e)}")

# Debug test endpoint
@api_router.get("/lists/test")
def test_lists_endpoint():
    print("DEBUG: /api/lists/test called successfully!")
    return {"message": "Lists router is working"}

# Debug: Print all registered routes
print("DEBUG: Registered API routes:")
for route in api_router.routes:
    if hasattr(route, 'path') and hasattr(route, 'methods'):
        print(f"  {route.methods} {route.path}")

@api_router.post("/admin/check-releases")
async def check_releases():
    """Check for new releases and update is_new flags - RESPECTS USER SOFT DELETES
    
    IMPORTANT: This function respects user soft deletes.
    - If User A soft-deleted "Cinderella III", it won't be marked as "new" for User A
    - If User B has "Cinderella III", it can still be marked as "new" for User B
    - Manual re-import of soft-deleted items is allowed and will restore them
    - Only automatic processes respect the soft delete flag
    """
    try:
        with Session(engine) as session:
            # Get all movies and series - RESPECTING user soft deletes
            # This function operates globally but respects individual user preferences
            movies = session.exec(select(Movie).where(Movie.deleted == False)).all()
            series = session.exec(select(Series).where(Series.deleted == False)).all()
            
            # Check for new releases (released in last 30 days)
            from datetime import datetime, timedelta
            thirty_days_ago = datetime.now() - timedelta(days=30)
            
            new_movies = []
            new_series = []
            
            for movie in movies:
                if movie.release_date:
                    try:
                        release_date = datetime.strptime(movie.release_date, "%Y-%m-%d")
                        if release_date >= thirty_days_ago:
                            movie.is_new = True
                            new_movies.append(movie.title)
                    except ValueError:
                        pass
            
            for series in series:
                # Check if any episodes are recent
                for episode in series.episodes:
                    if episode.air_date:
                        try:
                            air_date = datetime.strptime(episode.air_date, "%Y-%m-%d")
                            if air_date >= thirty_days_ago:
                                series.is_new = True
                                new_series.append(series.title)
                                break
                        except ValueError:
                            pass
            
            session.commit()
            
            return {
                "message": "Release check completed",
                "new_movies": new_movies,
                "new_series": new_series
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check releases: {str(e)}")

@api_router.post("/admin/remove-duplicates")
async def remove_duplicates(current_user: User = Depends(get_current_user)):
    """Remove duplicate movie and series entries from the database
    
    IMPORTANT: This function RESPECTS user soft deletes.
    - If User A soft-deleted "Cinderella III", it won't be processed for User A
    - If User B imports "Cinderella III", it can still be processed for User B
    - Manual re-import of soft-deleted items is allowed and will restore them
    - Only cron jobs and automatic processes respect the soft delete flag
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        with Session(engine) as session:
            removed_count = 0
            details = []
            
            # Find and remove duplicate movies (same IMDB ID) - PER USER ONLY
            # RESPECTS user soft deletes - only processes non-deleted items per user
            movie_duplicates = session.exec(
                select(Movie).where(Movie.deleted == False)
            ).all()
            
            # Group by user_id AND IMDB ID to respect user boundaries
            movie_groups = {}
            for movie in movie_duplicates:
                user_key = f"{movie.user_id}_{movie.imdb_id}"
                if user_key not in movie_groups:
                    movie_groups[user_key] = []
                movie_groups[user_key].append(movie)
            
            # Remove duplicates per user, keeping the oldest entry
            for user_key, movies in movie_groups.items():
                if len(movies) > 1:
                    # Sort by creation date, keep the oldest
                    movies.sort(key=lambda x: x.added_at if hasattr(x, 'added_at') else '1970-01-01')
                    movies_to_remove = movies[1:]  # Keep first (oldest), remove the rest
                    
                    for movie in movies_to_remove:
                        details.append(f"Removed duplicate movie: {movie.title} (User: {movie.user_id}, IMDB: {movie.imdb_id})")
                        movie.deleted = True
                        removed_count += 1
            
            # Find and remove duplicate series (same IMDB ID) - PER USER ONLY
            # RESPECTS user soft deletes - only processes non-deleted items per user
            series_duplicates = session.exec(
                select(Series).where(Series.deleted == False)
            ).all()
            
            # Group by user_id AND IMDB ID to respect user boundaries
            series_groups = {}
            for series in series_duplicates:
                user_key = f"{series.user_id}_{series.imdb_id}"
                if user_key not in series_groups:
                    series_groups[user_key] = []
                series_groups[user_key].append(series)
            
            # Remove duplicates per user, keeping the oldest entry
            for user_key, series_list in series_groups.items():
                if len(series_list) > 1:
                    # Sort by creation date, keep the oldest
                    series_list.sort(key=lambda x: x.added_at if hasattr(x, 'added_at') else '1970-01-01')
                    series_to_remove = series_list[1:]  # Keep first (oldest), remove the rest
                    
                    for series in series_to_remove:
                        details.append(f"Removed duplicate series: {series.title} (User: {series.user_id}, IMDB: {series.imdb_id})")
                        series.deleted = True
                        removed_count += 1
            
            session.commit()
            
            return {
                "message": f"Duplicate removal completed. Removed {removed_count} duplicate entries (per-user scope).",
                "removed_count": removed_count,
                "details": details
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove duplicates: {str(e)}")

@api_router.post("/admin/users/{user_id}/remove-duplicates")
async def remove_user_duplicates(user_id: int, current_user: User = Depends(get_current_admin_user)):
    """Remove duplicate movie and series entries for a specific user (admin only)"""
    try:
        with Session(engine) as session:
            target_user = session.exec(select(User).where(User.id == user_id)).first()
            if not target_user:
                raise HTTPException(status_code=404, detail="User not found")
            
            removed_count = 0
            details = []
            
            # Find and remove duplicate movies for this specific user
            user_movies = session.exec(
                select(Movie).where(Movie.user_id == user_id, Movie.deleted == False)
            ).all()
            
            # Group by IMDB ID for this user
            movie_groups = {}
            for movie in user_movies:
                if movie.imdb_id not in movie_groups:
                    movie_groups[movie.imdb_id] = []
                movie_groups[movie.imdb_id].append(movie)
            
            # Remove duplicates, keeping the oldest entry
            for imdb_id, movies in movie_groups.items():
                if len(movies) > 1:
                    movies.sort(key=lambda x: x.added_at if hasattr(x, 'added_at') else '1970-01-01')
                    movies_to_remove = movies[1:]
                    
                    for movie in movies_to_remove:
                        details.append(f"Removed duplicate movie: {movie.title} (IMDB: {imdb_id})")
                        movie.deleted = True
                        removed_count += 1
            
            # Find and remove duplicate series for this specific user
            user_series = session.exec(
                select(Series).where(Series.user_id == user_id, Series.deleted == False)
            ).all()
            
            # Group by IMDB ID for this user
            series_groups = {}
            for series in user_series:
                if series.imdb_id not in series_groups:
                    series_groups[series.imdb_id] = []
                series_groups[series.imdb_id].append(series)
            
            # Remove duplicates, keeping the oldest entry
            for imdb_id, series_list in series_groups.items():
                if len(series_list) > 1:
                    series_list.sort(key=lambda x: x.added_at if hasattr(x, 'added_at') else '1970-01-01')
                    series_to_remove = series_list[1:]
                    
                    for series in series_to_remove:
                        details.append(f"Removed duplicate series: {series.title} (IMDB: {imdb_id})")
                        series.deleted = True
                        removed_count += 1
            
            session.commit()
            
            return {
                "message": f"Duplicate removal completed for user {target_user.username}. Removed {removed_count} duplicate entries.",
                "removed_count": removed_count,
                "details": details
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove user duplicates: {str(e)}")

# Include the API router AFTER all endpoints are defined
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)