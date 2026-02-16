"""
Authentication endpoints for ViewVault.

Includes login, user info, password management, OAuth linking, and Auth0 callbacks.
"""

import os
import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select
from database import engine
from models import Movie, Series, Episode, User, List, ListItem, Token, UserLogin, ChangePassword
from deps import get_current_user, get_current_admin_user, limiter
from security import authenticate_user, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from auth0_bridge import auth0_bridge

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/auth/login", response_model=Token)
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


@router.get("/auth/me")
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    logger.debug(f"AUTH_ME: Called for user: {current_user.username}")
    logger.debug(f"AUTH_ME: User ID: {current_user.id}")
    logger.debug(f"AUTH_ME: Is admin: {current_user.is_admin}")
    logger.debug(f"AUTH_ME: User object: {current_user}")

    # Double-check from database
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if db_user:
            logger.debug(f"AUTH_ME: Database verification - ID: {db_user.id}, is_admin: {db_user.is_admin}")
        else:
            logger.error("AUTH_ME: User not found in database!")

        # Debug: Check all users in database
        logger.debug("AUTH_ME: Checking all users in database...")
        all_users = session.exec(select(User)).all()
        logger.debug(f"AUTH_ME: Found {len(all_users)} total users:")
        for user in all_users:
            logger.debug(f"  - User: {user.username}, ID: {user.id}, is_admin: {user.is_admin}")

        admin_users = session.exec(select(User).where(User.is_admin == True)).all()
        logger.debug(f"AUTH_ME: Found {len(admin_users)} admin users:")
        for user in admin_users:
            logger.debug(f"  - Admin: {user.username}, ID: {user.id}")

    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_admin": current_user.is_admin
    }


@router.get("/debug/auth-test")
def debug_auth_test(current_user: User = Depends(get_current_admin_user)):
    """Debug endpoint to test authentication - similar to watchlist but simpler"""
    logger.debug(f"AUTH_TEST: Called for user: {current_user.username} (ID: {current_user.id})")
    logger.debug(f"AUTH_TEST: User auth_provider: {getattr(current_user, 'auth_provider', 'unknown')}")
    logger.debug(f"AUTH_TEST: User is_active: {current_user.is_active}")
    logger.debug(f"AUTH_TEST: User auth0_user_id: {getattr(current_user, 'auth0_user_id', 'None')}")

    # Test database access
    try:
        with Session(engine) as session:
            logger.debug("AUTH_TEST: Database session created successfully")

            # Simple query to test database access
            user_count = session.exec(select(User)).all()
            logger.debug(f"AUTH_TEST: Total users in database: {len(user_count)}")

            # Test user-specific query
            user_movies = session.exec(select(Movie).where(Movie.user_id == current_user.id)).all()
            logger.debug(f"AUTH_TEST: Movies for user {current_user.id}: {len(user_movies)}")

            return {
                "status": "success",
                "user": {
                    "id": current_user.id,
                    "username": current_user.username,
                    "auth_provider": getattr(current_user, 'auth_provider', 'unknown'),
                    "auth0_user_id": getattr(current_user, 'auth0_user_id', None)
                },
                "database_test": {
                    "total_users": len(user_count),
                    "user_movies": len(user_movies)
                }
            }
    except Exception as e:
        logger.error(f"AUTH_TEST: Database error: {e}")
        import traceback
        logger.error(f"AUTH_TEST: Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database test failed: {str(e)}")


@router.post("/auth/change-password")
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


@router.post("/auth/add-password")
def add_password(payload: ChangePassword, current_user: User = Depends(get_current_user)):
    """Allow OAuth users to add password authentication to their account."""
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        if db_user.password_enabled:
            raise HTTPException(status_code=400, detail="Password authentication is already enabled for this account")

        if not db_user.oauth_enabled:
            raise HTTPException(status_code=400, detail="This account doesn't support adding password authentication")

        # Validate new password
        if len(payload.new_password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

        # Set password
        from security import get_password_hash
        db_user.hashed_password = get_password_hash(payload.new_password)
        db_user.password_enabled = True

        # Update auth provider to indicate both methods
        if db_user.oauth_enabled and db_user.password_enabled:
            db_user.auth_provider = "both"

        session.add(db_user)
        session.commit()

        return {"message": "Password added successfully. You can now login with either method."}


@router.get("/auth/account-info")
def get_account_info(current_user: User = Depends(get_current_user)):
    """Get current user's account information and available linking options"""
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "username": db_user.username,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "auth_provider": db_user.auth_provider,
            "password_enabled": db_user.password_enabled,
            "oauth_enabled": db_user.oauth_enabled,
            "email_verified": db_user.email_verified,
            "can_add_password": db_user.oauth_enabled and not db_user.password_enabled,
            "can_add_oauth": db_user.password_enabled and not db_user.oauth_enabled,
            "is_admin": db_user.is_admin,
            "created_at": db_user.created_at.isoformat() if db_user.created_at else None,
            "last_login": db_user.last_login.isoformat() if db_user.last_login else None
        }


@router.post("/auth/link-oauth")
def link_oauth_account(current_user: User = Depends(get_current_user)):
    """Get Auth0 login URL for linking OAuth to existing password account"""
    if not auth0_bridge.is_available:
        raise HTTPException(status_code=503, detail="OAuth linking not available")

    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        if not db_user.password_enabled:
            raise HTTPException(status_code=400, detail="This account doesn't support OAuth linking")

        if db_user.oauth_enabled:
            raise HTTPException(status_code=400, detail="OAuth is already linked to this account")

        auth_url = auth0_bridge.get_universal_login_url("login", state=f"link_account_{db_user.id}")

        if not auth_url:
            raise HTTPException(status_code=500, detail="Failed to generate OAuth link URL")

        return {
            "auth_url": auth_url,
            "message": "Use this URL to link your OAuth account. After authentication, your accounts will be linked."
        }


@router.delete("/auth/delete-current-user")
def delete_current_user(current_user: User = Depends(get_current_user)):
    """Delete the current user account (for testing purposes)"""
    logger.info(f"DELETE_USER: Deleting user: {current_user.username} (ID: {current_user.id})")
    with Session(engine) as session:
        db_user = session.get(User, current_user.id)
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        # Delete all user's data first (in reverse dependency order)
        logger.info(f"DELETE_USER: Deleting user data for {db_user.username}")

        # Delete list items
        list_items = session.exec(select(ListItem).where(ListItem.list_id.in_(
            select(List.id).where(List.user_id == current_user.id)
        ))).all()
        for item in list_items:
            session.delete(item)
        logger.info(f"DELETE_USER: Deleted {len(list_items)} list items")

        # Delete lists
        lists = session.exec(select(List).where(List.user_id == current_user.id)).all()
        for list_item in lists:
            session.delete(list_item)
        logger.info(f"DELETE_USER: Deleted {len(lists)} lists")

        # Delete episodes
        episodes = session.exec(select(Episode).where(Episode.series_id.in_(
            select(Series.id).where(Series.user_id == current_user.id)
        ))).all()
        for episode in episodes:
            session.delete(episode)
        logger.info(f"DELETE_USER: Deleted {len(episodes)} episodes")

        # Delete series
        series = session.exec(select(Series).where(Series.user_id == current_user.id)).all()
        for series_item in series:
            session.delete(series_item)
        logger.info(f"DELETE_USER: Deleted {len(series)} series")

        # Delete movies
        movies = session.exec(select(Movie).where(Movie.user_id == current_user.id)).all()
        for movie in movies:
            session.delete(movie)
        logger.info(f"DELETE_USER: Deleted {len(movies)} movies")

        # Finally, delete the user
        session.delete(db_user)
        session.commit()

        logger.info(f"DELETE_USER: Successfully deleted user {current_user.username} and all their data")
        return {"message": f"User {current_user.username} and all their data have been deleted"}


# =============================================================================
# AUTH0 AUTHENTICATION ROUTES
# =============================================================================

@router.get("/auth/auth0/config")
def get_auth0_config():
    """Get Auth0 configuration for frontend"""
    if not auth0_bridge.is_available:
        raise HTTPException(status_code=503, detail="Auth0 not configured")

    # Fix the audience URL if it's missing the colon (common typo)
    audience = auth0_bridge.audience
    if audience and "https//api.viewvault.app" in audience:
        audience = audience.replace("https//api.viewvault.app", "https://api.viewvault.app")
        logger.warning("Fixed malformed audience URL in config response")

    return {
        "domain": auth0_bridge.domain,
        "client_id": auth0_bridge.web_client_id,
        "audience": audience
    }


@router.get("/auth/auth0/oauth/{provider}")
def initiate_auth0_oauth(provider: str, request: Request):
    """Initiate Auth0 OAuth login with specified provider"""
    if not auth0_bridge.is_available:
        raise HTTPException(status_code=503, detail="Auth0 not configured")

    if provider not in ["google", "github", "facebook", "twitter"]:
        raise HTTPException(status_code=400, detail="Unsupported provider")

    oauth_url = auth0_bridge.get_authorization_url(provider)
    if not oauth_url:
        raise HTTPException(status_code=500, detail="Failed to generate OAuth URL")

    return {"oauth_url": oauth_url}


@router.post("/auth/auth0/callback")
async def handle_auth0_callback(request: Request):
    """Handle Auth0 OAuth callback and create JWT token"""
    if not auth0_bridge.is_available:
        raise HTTPException(status_code=503, detail="Auth0 not configured")

    try:
        body = await request.json()
        code = body.get("code")
        redirect_uri = body.get("redirect_uri")

        if not code or not redirect_uri:
            raise HTTPException(status_code=400, detail="Missing code or redirect_uri")

        # Exchange code for token
        token_data = auth0_bridge.exchange_code_for_token(code, redirect_uri)
        if not token_data:
            raise HTTPException(status_code=401, detail="Failed to exchange code for token")

        # Get user info
        user_data = auth0_bridge.get_user_info(token_data.get("access_token"))
        if not user_data:
            raise HTTPException(status_code=401, detail="Failed to get user information")

        # Create JWT token
        jwt_token = auth0_bridge.create_jwt_for_auth0_user(user_data)
        if not jwt_token:
            raise HTTPException(status_code=500, detail="Failed to create JWT token")

        return {"access_token": jwt_token, "token_type": "bearer"}

    except Exception as e:
        logger.error(f"Auth0 callback error: {e}")
        raise HTTPException(status_code=500, detail=f"Auth0 callback failed: {str(e)}")


@router.post("/auth/auth0/mobile-callback")
async def handle_auth0_mobile_callback(request: Request):
    """Handle Auth0 mobile callback with direct access token"""
    logger.debug("MOBILE CALLBACK: Starting mobile callback processing")

    if not auth0_bridge.is_available:
        logger.debug("MOBILE CALLBACK: Auth0 not configured")
        raise HTTPException(status_code=503, detail="Auth0 not configured")

    try:
        body = await request.json()
        access_token = body.get("access_token")

        logger.debug("MOBILE CALLBACK: Received access token" if access_token else "MOBILE CALLBACK: No access token provided")

        if not access_token:
            logger.debug("MOBILE CALLBACK: Missing access_token in request")
            raise HTTPException(status_code=400, detail="Missing access_token")

        # Handle mobile callback with access token
        logger.debug("MOBILE CALLBACK: Calling auth0_bridge.handle_mobile_callback")
        jwt_token = auth0_bridge.handle_mobile_callback(access_token)

        if not jwt_token:
            logger.error("MOBILE CALLBACK: Failed to create JWT token")
            raise HTTPException(status_code=401, detail="Failed to process mobile authentication")

        logger.info("MOBILE CALLBACK: Successfully created JWT token")
        return {"access_token": jwt_token, "token_type": "bearer"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MOBILE CALLBACK: Unexpected error: {e}")
        logger.error(f"Auth0 mobile callback error: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Auth0 mobile callback failed: {str(e)}")


# =============================================================================
# MOBILE AUTH0 UNIVERSAL LOGIN ENDPOINTS
# =============================================================================

@router.get("/auth/auth0/mobile/login")
async def get_mobile_auth0_login_url():
    """Get Auth0 Universal Login URL for mobile apps"""
    if not auth0_bridge.is_available:
        raise HTTPException(status_code=503, detail="Auth0 not configured")

    try:
        auth_url = auth0_bridge.get_universal_login_url("login")
        return {"auth_url": auth_url}
    except Exception as e:
        logger.error(f"Mobile Auth0 login URL error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate login URL: {str(e)}")


@router.get("/auth/auth0/mobile/signup")
async def get_mobile_auth0_signup_url():
    """Get Auth0 Universal Login URL for mobile app signup"""
    if not auth0_bridge.is_available:
        raise HTTPException(status_code=503, detail="Auth0 not configured")

    try:
        auth_url = auth0_bridge.get_universal_login_url("signup")
        return {"auth_url": auth_url}
    except Exception as e:
        logger.error(f"Mobile Auth0 signup URL error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate signup URL: {str(e)}")


@router.post("/auth/auth0/mobile/callback")
async def handle_mobile_auth0_callback(request: Request):
    """Handle Auth0 mobile callback with authorization code (same as web)"""
    logger.debug("MOBILE AUTH CALLBACK: Starting mobile callback processing")

    if not auth0_bridge.is_available:
        logger.warning("MOBILE AUTH CALLBACK: Auth0 not configured")
        raise HTTPException(status_code=503, detail="Auth0 not configured")

    try:
        body = await request.json()
        code = body.get("code")
        error = body.get("error")

        logger.debug("MOBILE AUTH CALLBACK: Received callback with authorization code")

        if error:
            logger.error(f"MOBILE AUTH CALLBACK: Auth0 error: {error}")
            raise HTTPException(status_code=400, detail=f"Auth0 authentication failed: {error}")

        if not code:
            logger.warning("MOBILE AUTH CALLBACK: No authorization code provided")
            raise HTTPException(status_code=400, detail="No authorization code provided")

        # Exchange code for token using mobile client ID
        base_url = os.getenv('BASE_URL', 'https://app.viewvault.app')
        redirect_uri = f"{base_url}/auth0/callback"  # Use same redirect URI as web

        token_data = auth0_bridge.exchange_code_for_token_mobile(code, redirect_uri)
        if not token_data:
            logger.error("MOBILE AUTH CALLBACK: Failed to exchange code for token")
            raise HTTPException(status_code=401, detail="Failed to exchange authorization code")

        # Get user info from Auth0 (same logic as web)
        user_data = auth0_bridge.get_user_info(token_data.get("access_token"))
        if not user_data:
            logger.error("MOBILE AUTH CALLBACK: Failed to get user information")
            raise HTTPException(status_code=401, detail="Failed to get user information")

        # Create JWT token for ViewVault (same logic as web)
        jwt_token = auth0_bridge.create_jwt_for_auth0_user(user_data)
        if not jwt_token:
            logger.error("MOBILE AUTH CALLBACK: Failed to create JWT token")
            raise HTTPException(status_code=401, detail="Failed to create authentication token")

        logger.info("MOBILE AUTH CALLBACK: Successfully created JWT token")
        return {"access_token": jwt_token, "token_type": "bearer"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MOBILE AUTH CALLBACK: Unexpected error: {e}")
        logger.error(f"Auth0 mobile callback error: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Auth0 mobile callback failed: {str(e)}")
