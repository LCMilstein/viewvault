"""
Shared dependencies for all ViewVault routers.

Provides re-usable FastAPI dependency wrappers, shared state,
and service instances so routers don't import from main.py directly.
"""

import os
import time
import logging
from database import engine
from security import get_current_user, get_current_admin_user
from sqlmodel import Session
from imdb_service import IMDBService, MockIMDBService
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Poster directory — shared across import and admin routers
# ---------------------------------------------------------------------------
POSTER_DIR = os.path.join("static", "posters")
os.makedirs(POSTER_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Rate limiter — shared instance, attached to app in main.py
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# IMDB service singleton
# ---------------------------------------------------------------------------
_imdb_api_key = os.getenv("IMDB_API_KEY")
if _imdb_api_key:
    logger.info("Using real IMDBService")
    imdb_service = IMDBService(_imdb_api_key)
else:
    logger.info("Using MockIMDBService (no IMDB_API_KEY set)")
    imdb_service = MockIMDBService()

# ---------------------------------------------------------------------------
# TMDB rate limiting — protects against 429s from TMDB
# ---------------------------------------------------------------------------
_tmdb_last_call_time = 0
_tmdb_min_interval = 0.1  # 100ms between calls


def rate_limit_tmdb():
    """Simple rate limiting for TMDB API calls."""
    global _tmdb_last_call_time
    current_time = time.time()
    time_since_last_call = current_time - _tmdb_last_call_time
    if time_since_last_call < _tmdb_min_interval:
        time.sleep(_tmdb_min_interval - time_since_last_call)
    _tmdb_last_call_time = time.time()


# ---------------------------------------------------------------------------
# FastAPI dependency — yields a SQLModel session
# ---------------------------------------------------------------------------
def get_session():
    """FastAPI dependency that yields a SQLModel session."""
    with Session(engine) as session:
        yield session
