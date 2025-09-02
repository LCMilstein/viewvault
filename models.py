from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: Optional[str] = None
    hashed_password: str
    is_active: bool = True
    is_admin: bool = False

class UserCreate(SQLModel):
    username: str
    email: Optional[str] = None
    password: str

class UserLogin(SQLModel):
    username: str
    password: str

class Token(SQLModel):
    access_token: str
    token_type: str

class ChangePassword(SQLModel):
    current_password: str
    new_password: str

class List(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")  # Owner of the list
    name: str
    description: Optional[str] = None
    type: str = Field(default="custom")  # "personal", "shared", "custom"
    color: Optional[str] = None  # Hex color code for list chip
    background_color: Optional[str] = None  # Hex color code for list page background
    icon: Optional[str] = None  # Emoji or icon identifier
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted: bool = Field(default=False)  # Soft delete flag

class ListItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    list_id: int = Field(foreign_key="list.id")
    item_type: str  # "movie", "series", "collection"
    item_id: int  # ID of the movie, series, or collection
    watched: bool = Field(default=False)
    watched_by: str = Field(default="you")  # "you", "family", "both"
    watched_at: Optional[datetime] = None
    added_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notes: Optional[str] = None  # List-specific notes
    deleted: bool = Field(default=False)  # Soft delete flag

class ListPermission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    list_id: int = Field(foreign_key="list.id")
    shared_with_user_id: int = Field(foreign_key="user.id")
    permission_level: str = Field(default="view")  # "view", "edit", "admin"
    share_data: str = Field(default="list_only")  # "list_only", "with_watch_state", "with_notes"
    keep_synced: bool = Field(default=False)  # Whether to keep list synchronized
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted: bool = Field(default=False)  # Soft delete flag

class Series(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")  # Link to user
    title: str
    imdb_id: str
    type: str = "series"
    poster_url: Optional[str] = None
    poster_thumb: Optional[str] = None  # Store thumbnail image data
    is_new: Optional[bool] = Field(default=False)  # Mark new seasons/episodes as new
    average_episode_runtime: Optional[int] = None  # Average episode runtime in minutes
    notes: Optional[str] = None  # User notes for the series
    added_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))  # When the series was added
    deleted: bool = Field(default=False)  # Soft delete flag

class Episode(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    series_id: int
    season: int
    episode: int
    title: str
    code: str  # SXXEXX
    air_date: Optional[str] = None
    watched: bool = False
    notes: Optional[str] = None  # User notes for the episode
    deleted: bool = Field(default=False)  # Soft delete flag

class Movie(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")  # Link to user
    title: str
    imdb_id: str
    release_date: Optional[str] = None
    runtime: Optional[int] = None  # Movie runtime in minutes
    watched: bool = False
    type: str = "movie"
    collection_id: Optional[int] = None  # TMDB collection/franchise ID
    collection_name: Optional[str] = None  # Franchise/collection name
    poster_url: Optional[str] = None
    poster_thumb: Optional[str] = None  # Store thumbnail image data
    is_new: Optional[bool] = Field(default=False)  # Mark new sequels as new
    quality: Optional[str] = None  # SD, HD, 4K, or None (not in Jellyfin)
    overview: Optional[str] = None  # Movie description/synopsis from TMDB
    notes: Optional[str] = None  # User notes for the movie
    added_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))  # When the movie was added
    deleted: bool = Field(default=False)  # Soft delete flag

class MovieCreate(SQLModel):
    title: str
    imdb_id: str
    release_date: Optional[str] = None
    watched: bool = False
    collection_id: Optional[int] = None
    collection_name: Optional[str] = None

class SeriesCreate(SQLModel):
    title: str
    imdb_id: str

class EpisodeCreate(SQLModel):
    series_id: int
    season: int
    episode: int
    title: str
    code: str
    air_date: Optional[str] = None
    watched: bool = False

# New Pydantic models for list operations
class ListCreate(SQLModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None

class ListUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None

class ListItemAdd(SQLModel):
    item_type: str  # "movie", "series", "collection"
    item_id: int
    notes: Optional[str] = None

class ListItemUpdate(SQLModel):
    watched: Optional[bool] = None
    watched_by: Optional[str] = None
    notes: Optional[str] = None

class LibraryImportHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    library_name: str  # Name of the Jellyfin library
    library_id: str  # Jellyfin library ID
    last_imported: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    import_count: int = Field(default=1)  # How many times this library was imported
    is_automated: bool = Field(default=False)  # Whether this library gets automated updates
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted: bool = Field(default=False)  # Soft delete flag