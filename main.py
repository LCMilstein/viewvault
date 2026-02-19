from dotenv import load_dotenv
import os

# Load environment variables from secrets.env if it exists
_secrets_loaded = False
if os.path.exists('secrets.env'):
    load_dotenv('secrets.env')
    _secrets_loaded = True
from fastapi import FastAPI, Depends, Request, APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session, select, text
from models import User
from security import get_current_admin_user
from auth0_bridge import auth0_bridge
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
from database import engine
import logging
from datetime import datetime

from deps import limiter, POSTER_DIR
from routers import admin, auth, episodes, imports, jellyfin, lists, movies, notifications, search, series, watchlist

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log deferred startup messages
if _secrets_loaded:
    logger.info("Loaded environment variables from secrets.env")
else:
    logger.info("secrets.env not found, using system environment variables")

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

# Initialize database tables on startup
logger.info("Initializing database...")
try:
    from init_database import init_database
    init_database()
except Exception as e:
    logger.error(f"Database initialization failed: {e}")
    # Don't crash the app, but log the error

def migrate_user_table():
    """Add missing columns to user table if they don't exist"""
    try:
        with Session(engine) as session:
            # Check if user table exists
            result = session.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='user'"))
            if not result.fetchone():
                logger.info("User table doesn't exist yet, will be created with all columns")
                return

            # Check which columns exist
            result = session.execute(text("PRAGMA table_info(user)"))
            existing_columns = [row[1] for row in result.fetchall()]
            logger.info(f"Existing user table columns: {existing_columns}")

            # Add missing columns
            new_columns = [
                ('email_verified', 'BOOLEAN DEFAULT FALSE'),
                ('password_enabled', 'BOOLEAN DEFAULT TRUE'),
                ('oauth_enabled', 'BOOLEAN DEFAULT FALSE')
            ]

            for column_name, column_def in new_columns:
                if column_name not in existing_columns:
                    logger.info(f"Adding missing column: {column_name}")
                    session.execute(text(f"ALTER TABLE user ADD COLUMN {column_name} {column_def}"))
                    session.commit()
                else:
                    logger.info(f"Column {column_name} already exists")

            # Update existing users based on their auth_provider
            logger.info("Updating existing user records...")
            session.execute(text("""
                UPDATE user
                SET email_verified = TRUE,
                    password_enabled = FALSE,
                    oauth_enabled = TRUE
                WHERE auth_provider = 'auth0'
            """))

            session.execute(text("""
                UPDATE user
                SET email_verified = FALSE,
                    password_enabled = TRUE,
                    oauth_enabled = FALSE
                WHERE auth_provider = 'local' OR auth_provider IS NULL
            """))

            session.commit()
            logger.info("User table migration completed successfully")

    except Exception as e:
        logger.error(f"Error during user table migration: {e}")
        import traceback
        logger.error(f"Migration traceback: {traceback.format_exc()}")

def create_db_and_tables():
    """Create database tables with proper migration handling"""
    logger.info("Starting database initialization...")

    try:
        # First, migrate existing user table if needed
        migrate_user_table()

        # Create all tables based on current models
        logger.info("Creating SQLModel tables...")
        SQLModel.metadata.create_all(engine)
        logger.info("SQLModel tables created successfully")
        logger.info("Database schema is up to date")

    except Exception as e:
        logger.error(f"Error during database initialization: {e}")
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

        # Run database migrations
        from database_migration import run_database_migration, fix_hashed_password_constraint
        run_database_migration()
        fix_hashed_password_constraint()
        logger.info("Database migrations completed")

        # Run performance optimizations
        from database_performance_migration import run_performance_migration
        run_performance_migration()
        logger.info("Performance optimizations completed")
    except Exception as e:
        logger.error(f"Error in lifespan: {e}")
        import traceback
        logger.error(f"Lifespan traceback: {traceback.format_exc()}")
    yield
    logger.info("Application lifespan ended")

# ---------------------------------------------------------------------------
# App creation, rate limiting, CORS, middleware, static files
# ---------------------------------------------------------------------------
app = FastAPI(lifespan=lifespan, title="ViewVault", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware — configurable via env var, defaults to ["*"] for backward compat
# Set CORS_ORIGINS in secrets.env as comma-separated list:
#   CORS_ORIGINS=https://app.viewvault.app,http://localhost:3000
cors_origins_env = os.getenv("CORS_ORIGINS", "")
cors_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()] if cors_origins_env else ["*"]
logger.info(f"CORS origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware — logs method, path, status, latency, user_id
from middleware import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)

# Mount static files with cache headers
from starlette.middleware.base import BaseHTTPMiddleware

class StaticCacheMiddleware(BaseHTTPMiddleware):
    """Add Cache-Control headers for static assets."""
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response

app.add_middleware(StaticCacheMiddleware)
app.mount("/static", StaticFiles(directory="static"), name="static")

# ---------------------------------------------------------------------------
# App-level routes (health, favicon, HTML pages, Auth0 web callbacks)
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "viewvault-server", "timestamp": datetime.now().isoformat()}

@app.get("/favicon.ico")
async def get_favicon():
    return FileResponse("static/icons/favicon.svg", media_type="image/svg+xml")

# ---------------------------------------------------------------------------
# API root — minimal router kept in main.py
# ---------------------------------------------------------------------------
api_router = APIRouter(prefix="/api")

@api_router.get("/")
def api_root():
    logger.info("API root endpoint called!")
    return {"message": "ViewVault API", "version": "2.0.0"}

# ---------------------------------------------------------------------------
# HTML-serving routes (login, register, Auth0 callbacks)
# ---------------------------------------------------------------------------

@app.get("/login")
async def login_page(request: Request):
    """Serve the unified login page"""
    return FileResponse("static/login.html")

@app.get("/register")
async def register_page(request: Request):
    """Serve the unified login page (handles both login and signup)"""
    return FileResponse("static/login.html")

@app.get("/auth0-login")
def read_auth0_login():
    return FileResponse("static/auth0-login.html")

@app.get("/email-login")
def read_email_login():
    return FileResponse("static/email-login.html")

@app.get("/auth0/callback")
async def auth0_callback_redirect(code: str = None, error: str = None, state: str = None):
    """Handle Auth0 callback and authenticate user with account linking support"""
    if error:
        logger.warning(f"AUTH0 CALLBACK: Error received: {error}")
        return RedirectResponse(f"/login?error={error}")

    if not code:
        logger.warning("AUTH0 CALLBACK: No code received")
        return RedirectResponse("/login?error=no_code")

    if not auth0_bridge.is_available:
        logger.warning("AUTH0 CALLBACK: Auth0 not configured")
        return RedirectResponse("/login?error=auth0_not_configured")

    try:
        logger.debug("AUTH0 CALLBACK: Processing authorization code")
        logger.debug(f"AUTH0 CALLBACK: State parameter: {state}")

        # Exchange code for token
        base_url = os.getenv('BASE_URL', 'https://app.viewvault.app')
        redirect_uri = f"{base_url}/auth0/callback"

        token_data = auth0_bridge.exchange_code_for_token(code, redirect_uri)
        if not token_data:
            logger.error("AUTH0 CALLBACK: Failed to exchange code for token")
            return RedirectResponse("/login?error=token_exchange_failed")

        # Get user info
        user_data = auth0_bridge.get_user_info(token_data.get("access_token"))
        if not user_data:
            logger.error("AUTH0 CALLBACK: Failed to get user information")
            return RedirectResponse("/login?error=user_info_failed")

        # Check if this is an account linking request
        if state and state.startswith("link_account_"):
            user_id = state.replace("link_account_", "")
            logger.info(f"AUTH0 CALLBACK: Account linking request for user ID: {user_id}")

            success = auth0_bridge.link_oauth_to_existing_user(user_data, int(user_id))
            if success:
                logger.info("AUTH0 CALLBACK: Successfully linked OAuth account")
                return RedirectResponse("/?message=oauth_linked_successfully")
            else:
                logger.error("AUTH0 CALLBACK: Failed to link OAuth account")
                return RedirectResponse("/?error=oauth_linking_failed")

        # Regular authentication flow — create JWT token
        jwt_token = auth0_bridge.create_jwt_for_auth0_user(user_data)
        if not jwt_token:
            logger.error("AUTH0 CALLBACK: Failed to create JWT token")
            return RedirectResponse("/login?error=jwt_creation_failed")

        logger.info(f"AUTH0 CALLBACK: Successfully authenticated user: {user_data.get('email', 'unknown')}")

        from urllib.parse import quote
        encoded_token = quote(jwt_token)
        redirect_url = f"/?token={encoded_token}"
        return RedirectResponse(url=redirect_url, status_code=302)

    except Exception as e:
        logger.error(f"AUTH0 CALLBACK: Exception during processing: {e}")
        return RedirectResponse(f"/login?error=callback_error")

@app.get("/auth/callback")
def auth_callback(request: Request):
    """OAuth callback handler - processes OAuth callback and redirects"""
    url_params = request.url.query
    return RedirectResponse(url=f"/login?{url_params}")

@app.get("/")
def read_root(request: Request):
    """Root handler - check for OAuth callback and redirect appropriately"""
    if request.url.query and "code=" in request.url.query:
        return RedirectResponse(url=f"/login?{request.url.query}")
    return FileResponse("static/index.html")

@app.get("/admin")
def admin_console(current_user: User = Depends(get_current_admin_user)):
    """Serve the admin console HTML - admin users only"""
    return FileResponse("static/admin.html")

# ---------------------------------------------------------------------------
# Include routers
# ---------------------------------------------------------------------------
app.include_router(api_router)

for r in [admin, auth, episodes, imports, jellyfin, lists, movies, notifications, search, series, watchlist]:
    app.include_router(r.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
