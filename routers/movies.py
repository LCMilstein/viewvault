"""
Movie CRUD endpoints for ViewVault.
"""

import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select
from database import engine
from models import Movie, MovieCreate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/movies/", status_code=status.HTTP_201_CREATED)
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


@router.get("/movies/")
def get_movies():
    with Session(engine) as session:
        movies = session.exec(select(Movie).where(Movie.deleted == False)).all()
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


@router.get("/movies/{movie_id}")
def get_movie(movie_id: int):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie or movie.deleted:
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


@router.put("/movies/{movie_id}")
def update_movie(movie_id: int, movie_update: MovieCreate):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie or movie.deleted:
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


@router.delete("/movies/{movie_id}")
def delete_movie(movie_id: int):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie:
            raise HTTPException(status_code=404, detail="Movie not found")

        session.delete(movie)
        session.commit()
        return {"message": "Movie deleted successfully"}


@router.patch("/movies/{movie_id}/watched")
def toggle_movie_watched_patch(movie_id: int):
    with Session(engine) as session:
        movie = session.get(Movie, movie_id)
        if not movie or movie.deleted:
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
