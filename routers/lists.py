"""
List CRUD, items, sharing, and copy/move endpoints for ViewVault.
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, text
from sqlalchemy import func
from database import engine
from models import (
    Movie, Series, Episode, User, List, ListItem, ListPermission,
    ListCreate, ListUpdate, ListItemAdd, ListItemUpdate,
    ListItemCopy, ListItemMove, BulkOperation
)
from deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Helper Functions
# =============================================================================

def expand_collection_items(collection_id: int, user_id: int, session: Session):
    """
    Get all movies in a collection for a specific user.
    Returns a list of movie IDs.
    Optimized with single query.
    """
    movies = session.exec(
        select(Movie.id).where(
            Movie.collection_id == collection_id,
            Movie.user_id == user_id,
            Movie.deleted == False
        )
    ).all()
    return list(movies)


def expand_series_items(series_id: int, session: Session):
    """
    Get series and all episodes for a specific series.
    Returns a tuple of (series_id, list of episode IDs).
    Optimized with single query selecting only IDs.
    """
    episodes = session.exec(
        select(Episode.id).where(
            Episode.series_id == series_id,
            Episode.deleted == False
        )
    ).all()
    return (series_id, list(episodes))


# =============================================================================
# Version Endpoint
# =============================================================================

@router.get("/version")
def get_version():
    """Simple endpoint to check if we're running the latest version"""
    return {
        "version": "automated-import-features",
        "has_debug_endpoint": True,
        "has_automated_import": True,
        "timestamp": "2025-08-22"
    }


# =============================================================================
# List CRUD
# =============================================================================

@router.get("/lists")
def get_user_lists(current_user: User = Depends(get_current_user)):
    """Get all lists for the current user"""
    logger.debug(f"LISTS ENDPOINT: Called for user: {current_user.username} (ID: {current_user.id})")
    logger.debug(f"LISTS ENDPOINT: User auth_provider: {getattr(current_user, 'auth_provider', 'unknown')}")
    try:
        # Create a fresh database session
        with Session(engine) as session:
            logger.debug("LISTS: Session created successfully")
            # Get user's own lists
            logger.debug("LISTS: Getting user's own lists...")
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
            logger.debug(f"LISTS: Found {len(user_lists)} user lists")

            # Get shared lists where user has access (defensive approach)
            try:
                logger.debug("LISTS: Getting shared lists...")
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
                logger.debug(f"LISTS: Found {len(shared_lists)} shared lists")
            except Exception as e:
                logger.error(f"LISTS: Error getting shared lists: {e}")
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
                "icon": "\U0001f4f1",
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
                    select(Episode).where(Episode.series_id == series.id, Episode.deleted == False)
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

            logger.debug(f"LISTS: Personal watchlist count - Movies: {unwatched_movies}, Series: {unwatched_series}, Total: {total_unwatched}")

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
                        series_obj = session.exec(
                            select(Series).where(
                                Series.id == item.item_id,
                                Series.deleted == False,
                                Series.user_id == current_user.id
                            )
                        ).first()
                        if series_obj and not item.watched:  # Only count unwatched series
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
                    "icon": user_list.icon or "\U0001f4cb",
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
                    "icon": shared_list.icon or "\U0001f517",
                    "is_active": shared_list.is_active,
                    "item_count": item_count,
                    "created_at": shared_list.created_at,
                    "owner": owner_username,
                    "permission": permission_level
                })

            return {"lists": all_lists}

    except Exception as e:
        import traceback
        logger.error(f"Error getting user lists: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get lists: {str(e)}")


@router.post("/lists")
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
                icon=list_data.icon or "\U0001f4cb"
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
        logger.error(f"Error creating list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create list: {str(e)}")


@router.put("/lists/{list_id}")
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
        logger.error(f"Error updating list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update list: {str(e)}")


@router.delete("/lists/{list_id}")
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
        logger.error(f"Error deleting list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete list: {str(e)}")


# =============================================================================
# List Items
# =============================================================================

@router.get("/lists/{list_id}/items")
def get_list_items(
    list_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get all items in a specific list"""
    try:
        with Session(engine) as session:
            # Handle personal list specially
            if list_id == "personal":
                # Import here to avoid circular imports
                from routers.watchlist import get_watchlist
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
                            "runtime": getattr(movie, 'runtime', None),
                            "overview": getattr(movie, 'overview', None),
                            "notes": item.notes,  # List-specific notes
                            "added_at": item.added_at,
                            "imported_at": getattr(movie, 'imported_at', None),
                            "is_new": getattr(movie, 'is_new', False),
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
                    collections[movie["collection_id"]]["movies"].append(movie)

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
        logger.error(f"Error getting list items: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get list items: {str(e)}")


@router.post("/lists/{list_id}/items")
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
        logger.error(f"Error adding item to list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add item to list: {str(e)}")


@router.delete("/lists/{list_id}/items/{item_id}")
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
        logger.error(f"Error removing item from list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove item from list: {str(e)}")


# =============================================================================
# Available Targets, Copy, Move, Bulk Operations
# =============================================================================

@router.get("/lists/{source_list_id}/available-targets")
def get_available_target_lists(
    source_list_id: int,
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100)
):
    """Get available target lists for copy/move operations with pagination"""
    try:
        with Session(engine) as session:
            # Validate source list exists (can be "personal" or numeric ID)
            if source_list_id != "personal":
                source_list = session.exec(
                    select(List).where(
                        List.id == source_list_id,
                        List.deleted == False
                    )
                ).first()

                if not source_list:
                    raise HTTPException(status_code=404, detail="Source list not found")

                # Check if user has access to source list
                if source_list.user_id != current_user.id:
                    shared_access = session.exec(
                        select(ListPermission).where(
                            ListPermission.list_id == source_list_id,
                            ListPermission.shared_with_user_id == current_user.id,
                            ListPermission.deleted == False
                        )
                    ).first()

                    if not shared_access:
                        raise HTTPException(status_code=403, detail="Access denied to source list")

            # Get all lists owned by current user (excluding source list)
            user_lists = session.exec(
                select(List).where(
                    List.user_id == current_user.id,
                    List.deleted == False
                )
            ).all()

            # Get shared lists where user has edit permission (excluding source list)
            shared_lists_query = session.exec(
                select(List).join(
                    ListPermission,
                    List.id == ListPermission.list_id
                ).where(
                    ListPermission.shared_with_user_id == current_user.id,
                    ListPermission.permission_level == "edit",
                    ListPermission.deleted == False,
                    List.deleted == False
                )
            ).all()

            # Combine all lists
            all_lists_data = []
            list_ids = []

            # Collect user's own lists
            for user_list in user_lists:
                # Skip source list
                if str(user_list.id) == str(source_list_id):
                    continue

                all_lists_data.append({
                    "id": user_list.id,
                    "name": user_list.name,
                    "icon": user_list.icon or "\U0001f4cb",
                    "color": user_list.color or "#007AFF",
                    "updated_at": user_list.updated_at
                })
                list_ids.append(user_list.id)

            # Collect shared lists with edit permission
            for shared_list in shared_lists_query:
                # Skip source list
                if str(shared_list.id) == str(source_list_id):
                    continue

                all_lists_data.append({
                    "id": shared_list.id,
                    "name": shared_list.name,
                    "icon": shared_list.icon or "\U0001f517",
                    "color": shared_list.color or "#007AFF",
                    "updated_at": shared_list.updated_at
                })
                list_ids.append(shared_list.id)

            # PERFORMANCE OPTIMIZATION: Batch fetch item counts for all lists
            if list_ids:
                item_counts_query = session.exec(
                    select(
                        ListItem.list_id,
                        func.count(ListItem.id).label('count')
                    ).where(
                        ListItem.list_id.in_(list_ids),
                        ListItem.deleted == False
                    ).group_by(ListItem.list_id)
                ).all()

                # Create lookup dict for item counts
                item_counts_map = {list_id: count for list_id, count in item_counts_query}
            else:
                item_counts_map = {}

            # Add item counts to list data
            for list_data in all_lists_data:
                list_data["item_count"] = item_counts_map.get(list_data["id"], 0)

            # Sort lists by most recently updated
            all_lists_data.sort(key=lambda x: x["updated_at"], reverse=True)

            # Calculate pagination
            total_lists = len(all_lists_data)
            total_pages = (total_lists + page_size - 1) // page_size
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size

            # Get paginated slice
            paginated_lists = all_lists_data[start_idx:end_idx]

            # Remove updated_at from response (used only for sorting)
            for list_item in paginated_lists:
                del list_item["updated_at"]

            return {
                "lists": paginated_lists,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_lists": total_lists,
                    "total_pages": total_pages,
                    "has_more": page < total_pages
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting available target lists: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get available target lists: {str(e)}")


@router.post("/lists/{source_list_id}/items/{item_id}/copy")
def copy_item_to_list(
    source_list_id: int,
    item_id: int,
    copy_data: ListItemCopy,
    current_user: User = Depends(get_current_user)
):
    """Copy an item from one list to another"""
    try:
        with Session(engine) as session:
            # Validate source list exists and user has access
            source_list = session.exec(
                select(List).where(
                    List.id == source_list_id,
                    List.deleted == False
                )
            ).first()

            if not source_list:
                raise HTTPException(status_code=404, detail="Source list not found")

            # Check if user owns the source list or has shared access
            if source_list.user_id != current_user.id:
                shared_access = session.exec(
                    select(ListPermission).where(
                        ListPermission.list_id == source_list_id,
                        ListPermission.shared_with_user_id == current_user.id,
                        ListPermission.deleted == False
                    )
                ).first()

                if not shared_access:
                    raise HTTPException(status_code=403, detail="Access denied to source list")

            # Validate target list exists and user has edit permission
            target_list = session.exec(
                select(List).where(
                    List.id == copy_data.target_list_id,
                    List.deleted == False
                )
            ).first()

            if not target_list:
                raise HTTPException(status_code=404, detail="Target list not found")

            # Check if user owns the target list or has edit permission
            has_target_access = False
            if target_list.user_id == current_user.id:
                has_target_access = True
            else:
                shared_access = session.exec(
                    select(ListPermission).where(
                        ListPermission.list_id == copy_data.target_list_id,
                        ListPermission.shared_with_user_id == current_user.id,
                        ListPermission.permission_level == "edit",
                        ListPermission.deleted == False
                    )
                ).first()

                if shared_access:
                    has_target_access = True

            if not has_target_access:
                raise HTTPException(status_code=403, detail="Access denied to target list")

            # Validate item type
            if copy_data.item_type not in ["movie", "series", "collection"]:
                raise HTTPException(status_code=400, detail="Invalid item type")

            # Find the source list item
            source_item = session.exec(
                select(ListItem).where(
                    ListItem.list_id == source_list_id,
                    ListItem.item_id == item_id,
                    ListItem.item_type == copy_data.item_type,
                    ListItem.deleted == False
                )
            ).first()

            if not source_item:
                raise HTTPException(status_code=404, detail="Item not found in source list")

            # Expand collections and series
            items_to_copy = []

            if copy_data.item_type == "collection":
                # Get all movies in the collection
                movie_ids = expand_collection_items(item_id, current_user.id, session)
                for movie_id in movie_ids:
                    items_to_copy.append({
                        "item_type": "movie",
                        "item_id": movie_id
                    })
            elif copy_data.item_type == "series":
                # Add the series itself and all episodes
                items_to_copy.append({
                    "item_type": "series",
                    "item_id": item_id
                })
                # Get all episodes for the series
                _, episode_ids = expand_series_items(item_id, session)
                for episode_id in episode_ids:
                    items_to_copy.append({
                        "item_type": "episode",
                        "item_id": episode_id
                    })
            else:
                # Single movie or other item type
                items_to_copy.append({
                    "item_type": copy_data.item_type,
                    "item_id": item_id
                })

            # Copy all items
            items_copied = 0
            duplicates_found = 0

            for item in items_to_copy:
                # Check for duplicate in target list
                existing_item = session.exec(
                    select(ListItem).where(
                        ListItem.list_id == copy_data.target_list_id,
                        ListItem.item_id == item["item_id"],
                        ListItem.item_type == item["item_type"],
                        ListItem.deleted == False
                    )
                ).first()

                if existing_item:
                    duplicates_found += 1
                    continue

                # Get source item metadata for this specific item
                item_source = session.exec(
                    select(ListItem).where(
                        ListItem.list_id == source_list_id,
                        ListItem.item_id == item["item_id"],
                        ListItem.item_type == item["item_type"],
                        ListItem.deleted == False
                    )
                ).first()

                # Preserve metadata from source if available, otherwise use defaults
                watched = False
                watched_by = "you"
                watched_at = None
                notes = None

                if item_source and copy_data.preserve_metadata:
                    watched = item_source.watched
                    watched_by = item_source.watched_by
                    watched_at = item_source.watched_at
                    notes = item_source.notes

                # Create new list item in target list
                new_item = ListItem(
                    list_id=copy_data.target_list_id,
                    item_type=item["item_type"],
                    item_id=item["item_id"],
                    watched=watched,
                    watched_by=watched_by,
                    watched_at=watched_at,
                    notes=notes,
                    added_at=datetime.now(timezone.utc)
                )

                session.add(new_item)
                items_copied += 1

            session.commit()

            # Build response message
            if duplicates_found > 0:
                message = f"{items_copied} item(s) copied to '{target_list.name}' ({duplicates_found} duplicate(s) skipped)"
            else:
                message = f"{items_copied} item(s) copied to '{target_list.name}' successfully"

            return {
                "success": True,
                "message": message,
                "duplicate": duplicates_found > 0,
                "items_affected": items_copied
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error copying item to list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to copy item: {str(e)}")


@router.post("/lists/{source_list_id}/items/{item_id}/move")
def move_item_to_list(
    source_list_id: int,
    item_id: int,
    move_data: ListItemMove,
    current_user: User = Depends(get_current_user)
):
    """Move an item from one list to another"""
    try:
        with Session(engine) as session:
            # Begin transaction
            session.begin()

            try:
                # Validate source list exists and user has access
                source_list = session.exec(
                    select(List).where(
                        List.id == source_list_id,
                        List.deleted == False
                    )
                ).first()

                if not source_list:
                    raise HTTPException(status_code=404, detail="Source list not found")

                # Check if user owns the source list or has shared access
                if source_list.user_id != current_user.id:
                    shared_access = session.exec(
                        select(ListPermission).where(
                            ListPermission.list_id == source_list_id,
                            ListPermission.shared_with_user_id == current_user.id,
                            ListPermission.deleted == False
                        )
                    ).first()

                    if not shared_access:
                        raise HTTPException(status_code=403, detail="Access denied to source list")

                # Validate target list exists and user has edit permission
                target_list = session.exec(
                    select(List).where(
                        List.id == move_data.target_list_id,
                        List.deleted == False
                    )
                ).first()

                if not target_list:
                    raise HTTPException(status_code=404, detail="Target list not found")

                # Check if user owns the target list or has edit permission
                has_target_access = False
                if target_list.user_id == current_user.id:
                    has_target_access = True
                else:
                    shared_access = session.exec(
                        select(ListPermission).where(
                            ListPermission.list_id == move_data.target_list_id,
                            ListPermission.shared_with_user_id == current_user.id,
                            ListPermission.permission_level == "edit",
                            ListPermission.deleted == False
                        )
                    ).first()

                    if shared_access:
                        has_target_access = True

                if not has_target_access:
                    raise HTTPException(status_code=403, detail="Access denied to target list")

                # Validate item type
                if move_data.item_type not in ["movie", "series", "collection"]:
                    raise HTTPException(status_code=400, detail="Invalid item type")

                # Find the source list item
                source_item = session.exec(
                    select(ListItem).where(
                        ListItem.list_id == source_list_id,
                        ListItem.item_id == item_id,
                        ListItem.item_type == move_data.item_type,
                        ListItem.deleted == False
                    )
                ).first()

                if not source_item:
                    raise HTTPException(status_code=404, detail="Item not found in source list")

                # Expand collections and series
                items_to_move = []

                if move_data.item_type == "collection":
                    # Get all movies in the collection
                    movie_ids = expand_collection_items(item_id, current_user.id, session)
                    for movie_id in movie_ids:
                        items_to_move.append({
                            "item_type": "movie",
                            "item_id": movie_id
                        })
                elif move_data.item_type == "series":
                    # Add the series itself and all episodes
                    items_to_move.append({
                        "item_type": "series",
                        "item_id": item_id
                    })
                    # Get all episodes for the series
                    _, episode_ids = expand_series_items(item_id, session)
                    for episode_id in episode_ids:
                        items_to_move.append({
                            "item_type": "episode",
                            "item_id": episode_id
                        })
                else:
                    # Single movie or other item type
                    items_to_move.append({
                        "item_type": move_data.item_type,
                        "item_id": item_id
                    })

                # Move all items
                items_moved = 0
                duplicates_removed = 0

                for item in items_to_move:
                    # Get source item for this specific item
                    item_source = session.exec(
                        select(ListItem).where(
                            ListItem.list_id == source_list_id,
                            ListItem.item_id == item["item_id"],
                            ListItem.item_type == item["item_type"],
                            ListItem.deleted == False
                        )
                    ).first()

                    if not item_source:
                        # Item not in source list, skip
                        continue

                    # Check for duplicate in target list
                    existing_item = session.exec(
                        select(ListItem).where(
                            ListItem.list_id == move_data.target_list_id,
                            ListItem.item_id == item["item_id"],
                            ListItem.item_type == item["item_type"],
                            ListItem.deleted == False
                        )
                    ).first()

                    if existing_item:
                        # Duplicate exists - just remove from source
                        item_source.deleted = True
                        session.add(item_source)
                        duplicates_removed += 1
                    else:
                        # Create new list item in target list
                        new_item = ListItem(
                            list_id=move_data.target_list_id,
                            item_type=item["item_type"],
                            item_id=item["item_id"],
                            watched=item_source.watched,
                            watched_by=item_source.watched_by,
                            watched_at=item_source.watched_at,
                            notes=item_source.notes,
                            added_at=datetime.now(timezone.utc)
                        )

                        session.add(new_item)

                        # Soft delete from source list
                        item_source.deleted = True
                        session.add(item_source)
                        items_moved += 1

                # Commit transaction
                session.commit()

                # Build response message
                if duplicates_removed > 0:
                    message = f"{items_moved} item(s) moved to '{target_list.name}' ({duplicates_removed} duplicate(s) removed from source)"
                else:
                    message = f"{items_moved} item(s) moved to '{target_list.name}' successfully"

                return {
                    "success": True,
                    "message": message,
                    "duplicate": duplicates_removed > 0,
                    "items_affected": items_moved + duplicates_removed
                }

            except HTTPException:
                # Rollback on HTTP exceptions
                session.rollback()
                raise
            except Exception as e:
                # Rollback on any other error
                session.rollback()
                logger.error(f"Error moving item to list: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to move item: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in move operation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to move item: {str(e)}")


@router.post("/lists/bulk-operation")
def bulk_copy_move_operation(
    bulk_data: BulkOperation,
    current_user: User = Depends(get_current_user)
):
    """Perform bulk copy or move operations on multiple items"""
    try:
        # Validate operation type
        if bulk_data.operation not in ["copy", "move"]:
            raise HTTPException(status_code=400, detail="Operation must be 'copy' or 'move'")

        # Validate items array is not empty
        if not bulk_data.items or len(bulk_data.items) == 0:
            raise HTTPException(status_code=400, detail="Items array cannot be empty")

        with Session(engine) as session:
            # Begin transaction for entire bulk operation
            session.begin()

            try:
                # Validate source list exists and user has access
                source_list = session.exec(
                    select(List).where(
                        List.id == bulk_data.source_list_id,
                        List.deleted == False
                    )
                ).first()

                if not source_list:
                    raise HTTPException(status_code=404, detail="Source list not found")

                # Check if user owns the source list or has shared access
                if source_list.user_id != current_user.id:
                    shared_access = session.exec(
                        select(ListPermission).where(
                            ListPermission.list_id == bulk_data.source_list_id,
                            ListPermission.shared_with_user_id == current_user.id,
                            ListPermission.deleted == False
                        )
                    ).first()

                    if not shared_access:
                        raise HTTPException(status_code=403, detail="Access denied to source list")

                # Validate target list exists and user has edit permission
                target_list = session.exec(
                    select(List).where(
                        List.id == bulk_data.target_list_id,
                        List.deleted == False
                    )
                ).first()

                if not target_list:
                    raise HTTPException(status_code=404, detail="Target list not found")

                # Check if user owns the target list or has edit permission
                has_target_access = False
                if target_list.user_id == current_user.id:
                    has_target_access = True
                else:
                    shared_access = session.exec(
                        select(ListPermission).where(
                            ListPermission.list_id == bulk_data.target_list_id,
                            ListPermission.shared_with_user_id == current_user.id,
                            ListPermission.permission_level == "edit",
                            ListPermission.deleted == False
                        )
                    ).first()

                    if shared_access:
                        has_target_access = True

                if not has_target_access:
                    raise HTTPException(status_code=403, detail="Access denied to target list")

                # Validate all items before starting operation
                for item in bulk_data.items:
                    if item.item_type not in ["movie", "series", "collection", "episode"]:
                        raise HTTPException(status_code=400, detail=f"Invalid item type: {item.item_type}")

                    # Verify item exists in source list
                    source_item = session.exec(
                        select(ListItem).where(
                            ListItem.list_id == bulk_data.source_list_id,
                            ListItem.item_id == item.item_id,
                            ListItem.item_type == item.item_type,
                            ListItem.deleted == False
                        )
                    ).first()

                    if not source_item:
                        raise HTTPException(
                            status_code=404,
                            detail=f"Item {item.item_id} of type {item.item_type} not found in source list"
                        )

                # Expand all items (collections and series)
                expanded_items = []
                for item in bulk_data.items:
                    if item.item_type == "collection":
                        # Get all movies in the collection
                        movie_ids = expand_collection_items(item.item_id, current_user.id, session)
                        for movie_id in movie_ids:
                            expanded_items.append({
                                "item_type": "movie",
                                "item_id": movie_id
                            })
                    elif item.item_type == "series":
                        # Add the series itself and all episodes
                        expanded_items.append({
                            "item_type": "series",
                            "item_id": item.item_id
                        })
                        # Get all episodes for the series
                        _, episode_ids = expand_series_items(item.item_id, session)
                        for episode_id in episode_ids:
                            expanded_items.append({
                                "item_type": "episode",
                                "item_id": episode_id
                            })
                    else:
                        # Single movie, episode, or other item type
                        expanded_items.append({
                            "item_type": item.item_type,
                            "item_id": item.item_id
                        })

                # PERFORMANCE OPTIMIZATION: Batch fetch all source items and check duplicates
                # Batch fetch all source items
                source_items_query = session.exec(
                    select(ListItem).where(
                        ListItem.list_id == bulk_data.source_list_id,
                        ListItem.deleted == False
                    )
                ).all()

                # Create lookup dict for source items
                source_items_map = {
                    (item.item_id, item.item_type): item
                    for item in source_items_query
                }

                # Batch fetch all existing items in target list to check for duplicates
                existing_items_query = session.exec(
                    select(ListItem).where(
                        ListItem.list_id == bulk_data.target_list_id,
                        ListItem.deleted == False
                    )
                ).all()

                # Create set of existing (item_id, item_type) tuples for fast lookup
                existing_items_set = {
                    (item.item_id, item.item_type)
                    for item in existing_items_query
                }

                # Process each item with batch-fetched data
                items_affected = 0
                duplicates_skipped = 0
                errors = []
                new_items_batch = []
                items_to_delete = []

                for item in expanded_items:
                    try:
                        item_key = (item["item_id"], item["item_type"])

                        # Get source item from pre-fetched map
                        item_source = source_items_map.get(item_key)

                        if not item_source:
                            # Item not in source list, skip
                            continue

                        # Check for duplicate using pre-fetched set
                        if item_key in existing_items_set:
                            # Duplicate exists
                            duplicates_skipped += 1

                            # For move operations, mark source for deletion
                            if bulk_data.operation == "move":
                                items_to_delete.append(item_source)
                                items_affected += 1

                            continue

                        # Prepare metadata
                        watched = False
                        watched_by = "you"
                        watched_at = None
                        notes = None

                        if bulk_data.operation == "copy" and bulk_data.preserve_metadata:
                            watched = item_source.watched
                            watched_by = item_source.watched_by
                            watched_at = item_source.watched_at
                            notes = item_source.notes
                        elif bulk_data.operation == "move":
                            # Always preserve metadata for move operations
                            watched = item_source.watched
                            watched_by = item_source.watched_by
                            watched_at = item_source.watched_at
                            notes = item_source.notes

                        # Create new list item for batch insert
                        new_item = ListItem(
                            list_id=bulk_data.target_list_id,
                            item_type=item["item_type"],
                            item_id=item["item_id"],
                            watched=watched,
                            watched_by=watched_by,
                            watched_at=watched_at,
                            notes=notes,
                            added_at=datetime.now(timezone.utc)
                        )

                        new_items_batch.append(new_item)

                        # For move operations, mark source for deletion
                        if bulk_data.operation == "move":
                            items_to_delete.append(item_source)

                        items_affected += 1

                    except Exception as item_error:
                        # Track individual item errors but continue processing
                        error_msg = f"Failed to {bulk_data.operation} item {item['item_id']} ({item['item_type']}): {str(item_error)}"
                        errors.append(error_msg)
                        logger.error(error_msg)

                # PERFORMANCE OPTIMIZATION: Batch insert all new items
                if new_items_batch:
                    session.add_all(new_items_batch)

                # PERFORMANCE OPTIMIZATION: Batch update deleted flags for move operations
                if items_to_delete:
                    for item in items_to_delete:
                        item.deleted = True
                    session.add_all(items_to_delete)

                # Commit transaction
                session.commit()

                # Build response message
                operation_verb = "copied" if bulk_data.operation == "copy" else "moved"
                message = f"{items_affected} item(s) {operation_verb} to '{target_list.name}'"

                if duplicates_skipped > 0:
                    message += f" ({duplicates_skipped} duplicate(s) skipped)"

                if errors:
                    message += f" with {len(errors)} error(s)"

                return {
                    "success": True,
                    "message": message,
                    "items_affected": items_affected,
                    "duplicates_skipped": duplicates_skipped,
                    "errors": errors
                }

            except HTTPException:
                # Rollback on HTTP exceptions
                session.rollback()
                raise
            except Exception as e:
                # Rollback on any other error
                session.rollback()
                logger.error(f"Error in bulk {bulk_data.operation} operation: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to {bulk_data.operation} items: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk operation: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to perform bulk operation: {str(e)}")


@router.patch("/lists/{list_id}/items/{item_id}/watched")
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
        logger.error(f"Error updating item in list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update item: {str(e)}")


# =============================================================================
# List Sharing
# =============================================================================

@router.post("/lists/{list_id}/share")
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
        logger.error(f"Error sharing list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to share list: {str(e)}")


@router.delete("/lists/{list_id}/unshare")
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
        logger.error(f"Error unsharing list: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to unshare list: {str(e)}")
