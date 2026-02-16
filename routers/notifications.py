"""
Notification, release check, and library import history endpoints for ViewVault.
"""

import logging
import threading
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from database import engine
from models import Movie, Series, Episode, User, LibraryImportHistory
from deps import get_current_user, get_current_admin_user, limiter

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Release Checking
# =============================================================================

@router.post("/admin/check-releases")
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
        raise HTTPException(status_code=500, detail=f"Release check failed: {str(e)}")


# =============================================================================
# Notifications
# =============================================================================

@router.get("/notifications/new-releases")
def get_new_releases():
    """Get new releases for notification badges"""
    try:
        with Session(engine) as session:
            # Get new movies (SQLite stores booleans as integers)
            new_movies = session.exec(
                select(Movie).where(Movie.is_new == 1, Movie.deleted == False)
            ).all()

            # Get series with new episodes (SQLite stores booleans as integers)
            new_series = session.exec(
                select(Series).where(Series.is_new == 1, Series.deleted == False)
            ).all()

            # Count new episodes
            new_episode_count = 0
            for series in new_series:
                episodes = session.exec(
                    select(Episode).where(Episode.series_id == series.id, Episode.deleted == False)
                ).all()
                new_episode_count += len(episodes)

            return {
                "new_movies": len(new_movies),
                "new_series": len(new_series),
                "new_episodes": new_episode_count,
                "total_new_items": len(new_movies) + new_episode_count
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get new releases: {str(e)}")


@router.post("/notifications/mark-seen")
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
        raise HTTPException(status_code=500, detail=f"Failed to mark notifications as seen: {str(e)}")


@router.get("/notifications/details")
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
                    select(Episode).where(Episode.series_id == series.id, Episode.deleted == False)
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
        raise HTTPException(status_code=500, detail=f"Failed to get notification details: {str(e)}")


# =============================================================================
# Automated Import & Library History
# =============================================================================

@router.post("/admin/trigger-automated-import")
async def trigger_automated_import(current_user: User = Depends(get_current_admin_user)):
    """Manually trigger the automated import checker (admin only)"""
    try:
        logger.info("Admin triggered automated import check")

        # Import and run the automated import checker
        from automated_import_checker import main as run_automated_import

        # Run in a separate thread to avoid blocking
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
        raise HTTPException(status_code=500, detail=f"Failed to trigger automated import: {str(e)}")


@router.get("/admin/library-import-history")
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
        raise HTTPException(status_code=500, detail=f"Failed to get library import history: {str(e)}")


@router.get("/library-import-history")
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
        raise HTTPException(status_code=500, detail=f"Failed to get library import history: {str(e)}")


@router.post("/library-import-history/{history_id}/toggle-automation")
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
                raise HTTPException(status_code=404, detail="Library import history not found")

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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to toggle library automation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to toggle library automation: {str(e)}")


@router.get("/admin/progress-performance")
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
        raise HTTPException(status_code=500, detail=f"Failed to get progress performance: {str(e)}")
