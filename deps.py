"""
Shared dependencies for all ViewVault routers.

Provides re-usable FastAPI dependency wrappers and shared state
so routers don't import from main.py directly.
"""

import os
import logging
from database import engine
from security import get_current_user, get_current_admin_user
from sqlmodel import Session

logger = logging.getLogger(__name__)

# Poster directory — shared across import and admin routers
POSTER_DIR = os.path.join("static", "posters")
os.makedirs(POSTER_DIR, exist_ok=True)


def get_session():
    """FastAPI dependency that yields a SQLModel session."""
    with Session(engine) as session:
        yield session
