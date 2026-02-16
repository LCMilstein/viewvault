"""
Admin endpoints for ViewVault.

Includes user management, dashboard stats, duplicate removal, and debug endpoints.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select, text
from database import engine
from models import Movie, Series, Episode, User, List, ListItem
from deps import get_current_user, get_current_admin_user, limiter
from security import get_password_hash
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Admin User Management
# =============================================================================

@router.get("/admin/users")
def get_admin_users(current_user: User = Depends(get_current_admin_user)):
    """Get all users for admin management"""
    try:
        logger.info(f"Admin users request from user: {current_user.username}")
        with Session(engine) as session:
            logger.debug("Database session created successfully")
            # Get all active users with their item counts
            users = []
            active_users = session.exec(select(User).where(User.is_active == True)).all()
            logger.debug(f"Found {len(active_users)} active users")

            for user in active_users:
                logger.debug(f"Processing user: {user.username}")
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

            logger.debug(f"Returning {len(users)} users")
            return {"users": users}
    except Exception as e:
        logger.error(f"Error getting admin users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get users: {str(e)}")


@router.get("/admin/users/{user_id}")
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
        logger.error(f"Error getting admin user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")


@router.put("/admin/users/{user_id}")
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
        logger.error(f"Error updating admin user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")


@router.post("/admin/users/{user_id}/clear-data")
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
        logger.error(f"Error clearing user data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear user data: {str(e)}")


@router.post("/admin/users/{user_id}/reset-password")
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
        logger.error(f"Error resetting user password: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset password: {str(e)}")


@router.delete("/admin/users/{user_id}")
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
        logger.error(f"Error deleting admin user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")


# =============================================================================
# Admin Dashboard & Stats
# =============================================================================

@router.get("/admin/dashboard")
def get_admin_dashboard(current_user: User = Depends(get_current_admin_user)):
    """Get admin dashboard statistics

    NOTE: This function provides global system statistics for admin monitoring.
    Individual user operations properly respect user boundaries and soft deletes.
    """
    try:
        logger.info(f"Admin dashboard request from user: {current_user.username}")
        with Session(engine) as session:
            logger.debug("Database session created successfully")
            # Count total users
            total_users = len(session.exec(select(User).where(User.is_active == True)).all())
            logger.debug(f"Total active users: {total_users}")

            # Count total movies and series (global stats for admin monitoring)
            # NOTE: These are global counts for system monitoring only
            # Individual user queries properly filter by user_id + deleted status
            total_movies = len(session.exec(select(Movie).where(Movie.deleted == False)).all())
            total_series = len(session.exec(select(Series).where(Series.deleted == False)).all())
            logger.debug(f"Total movies: {total_movies}, Total series: {total_series}")

            # Count admin users
            admin_users = len(session.exec(select(User).where(User.is_admin == True, User.is_active == True)).all())
            logger.debug(f"Total admin users: {admin_users}")

            result = {
                "total_users": total_users,
                "total_movies": total_movies,
                "total_series": total_series,
                "admin_users": admin_users
            }
            logger.debug(f"Dashboard result: {result}")
            return result
    except Exception as e:
        logger.error(f"Error getting admin dashboard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get dashboard data: {str(e)}")


@router.get("/admin/usage-stats")
def get_usage_stats(current_user: User = Depends(get_current_admin_user)):
    """Get detailed usage statistics for admin monitoring.

    Returns active users (last 30 days), content totals, per-user breakdowns,
    and recent activity. No new tables needed -- queries existing data.
    """
    try:
        with Session(engine) as session:
            now = datetime.now(timezone.utc)
            thirty_days_ago = now - timedelta(days=30)
            seven_days_ago = now - timedelta(days=7)

            # --- Active users ---
            all_active_users = session.exec(select(User).where(User.is_active == True)).all()
            active_30d = [u for u in all_active_users if u.last_login and u.last_login >= thirty_days_ago]
            active_7d = [u for u in active_30d if u.last_login >= seven_days_ago]

            # --- Content totals ---
            total_movies = len(session.exec(select(Movie).where(Movie.deleted == False)).all())
            total_series = len(session.exec(select(Series).where(Series.deleted == False)).all())
            total_episodes = len(session.exec(select(Episode).where(Episode.deleted == False)).all())
            total_lists = len(session.exec(select(List).where(List.deleted == False)).all())

            # --- Per-user breakdown (top 10 by content count) ---
            per_user = []
            for user in all_active_users:
                movie_count = len(session.exec(
                    select(Movie).where(Movie.user_id == user.id, Movie.deleted == False)
                ).all())
                series_count = len(session.exec(
                    select(Series).where(Series.user_id == user.id, Series.deleted == False)
                ).all())
                list_count = len(session.exec(
                    select(List).where(List.user_id == user.id, List.deleted == False)
                ).all())
                per_user.append({
                    "user_id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "auth_provider": user.auth_provider,
                    "last_login": user.last_login.isoformat() if user.last_login else None,
                    "created_at": user.created_at.isoformat() if user.created_at else None,
                    "movies": movie_count,
                    "series": series_count,
                    "lists": list_count,
                    "total_items": movie_count + series_count,
                })
            per_user.sort(key=lambda x: x["total_items"], reverse=True)

            # --- Recently added content (last 7 days) ---
            recent_movies = len(session.exec(
                select(Movie).where(Movie.deleted == False, Movie.added_at >= seven_days_ago)
            ).all())
            recent_series = len(session.exec(
                select(Series).where(Series.deleted == False, Series.added_at >= seven_days_ago)
            ).all())

            # --- Auth provider breakdown ---
            auth_breakdown = {}
            for user in all_active_users:
                provider = user.auth_provider or "local"
                auth_breakdown[provider] = auth_breakdown.get(provider, 0) + 1

            result = {
                "users": {
                    "total_active": len(all_active_users),
                    "active_last_30d": len(active_30d),
                    "active_last_7d": len(active_7d),
                    "auth_providers": auth_breakdown,
                },
                "content": {
                    "total_movies": total_movies,
                    "total_series": total_series,
                    "total_episodes": total_episodes,
                    "total_lists": total_lists,
                    "added_last_7d": {
                        "movies": recent_movies,
                        "series": recent_series,
                    },
                },
                "per_user": per_user[:10],  # Top 10 by content
                "generated_at": now.isoformat(),
            }

            logger.info(f"Usage stats generated for admin {current_user.username}")
            return result
    except Exception as e:
        logger.error(f"Error generating usage stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate usage stats: {str(e)}")


# =============================================================================
# Duplicate Removal
# =============================================================================

@router.post("/admin/remove-duplicates")
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


@router.post("/admin/users/{user_id}/remove-duplicates")
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


# =============================================================================
# Make Admin & Toggle Admin
# =============================================================================

@router.post("/auth/make-admin")
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


@router.post("/admin/users/{user_id}/toggle-admin")
def toggle_user_admin_status(user_id: int, admin_update: dict, current_user: User = Depends(get_current_admin_user)):
    """Toggle admin status for a user (admin only)"""
    logger.info(f"TOGGLE_ADMIN: Admin {current_user.username} toggling admin status for user {user_id}")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status")

    try:
        with Session(engine) as session:
            user = session.exec(select(User).where(User.id == user_id)).first()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            new_admin_status = admin_update.get("is_admin", False)
            logger.info(f"TOGGLE_ADMIN: Setting user {user.username} admin status to {new_admin_status}")

            user.is_admin = new_admin_status
            session.add(user)
            session.commit()

            logger.info(f"TOGGLE_ADMIN: Successfully updated {user.username} admin status to {new_admin_status}")
            return {"message": f"User {user.username} admin status updated to {new_admin_status}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TOGGLE_ADMIN: Error updating admin status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update admin status: {str(e)}")


# =============================================================================
# Debug / Test Endpoints
# =============================================================================

@router.get("/lists/test")
def test_lists_endpoint():
    logger.debug("/api/lists/test called successfully!")
    return {"message": "Lists router is working"}


@router.post("/admin/clear_all")
@limiter.limit("1/minute")
def clear_all(request: Request, current_user: User = Depends(get_current_admin_user)):
    """Clear all data - Admin only"""
    with Session(engine) as session:
        session.exec(text("DELETE FROM episode"))
        session.exec(text("DELETE FROM movie"))
        session.exec(text("DELETE FROM series"))
        session.commit()
    return {"message": "All data cleared"}


@router.get("/test-db")
def test_database(current_user: User = Depends(get_current_admin_user)):
    """Test database connection and basic queries (admin only)"""
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


@router.get("/debug/movies")
def debug_movies(current_user: User = Depends(get_current_admin_user)):
    """Debug endpoint to see all movies in database with collection info (admin only)"""
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
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug/users")
def debug_users_api(current_user: User = Depends(get_current_admin_user)):
    """Debug endpoint to check users in database (admin only)"""
    try:
        with Session(engine) as session:
            users = session.exec(select(User)).all()
            user_data = []
            for user in users:
                user_data.append({
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "auth_provider": user.auth_provider,
                    "is_admin": user.is_admin
                })
            return {
                "total_users": len(user_data),
                "users": user_data
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
