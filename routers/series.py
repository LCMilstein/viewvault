"""
Series CRUD endpoints for ViewVault.
"""

import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select
from database import engine
from models import Series, SeriesCreate
from utils import get_series_from_tvmaze_by_imdb

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/series/", status_code=status.HTTP_201_CREATED)
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


@router.get("/series/")
def get_series():
    with Session(engine) as session:
        series = session.exec(select(Series).where(Series.deleted == False)).all()
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
                    import threading
                    poster_result = {}
                    def fetch_tvmaze():
                        try:
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


@router.get("/series/{series_id}")
def get_series_by_id(series_id: int):
    with Session(engine) as session:
        series = session.get(Series, series_id)
        if not series or series.deleted:
            raise HTTPException(status_code=404, detail="Series not found")
        return series


@router.put("/series/{series_id}")
def update_series(series_id: int, series_update: SeriesCreate):
    with Session(engine) as session:
        series = session.get(Series, series_id)
        if not series or series.deleted:
            raise HTTPException(status_code=404, detail="Series not found")

        for field, value in series_update.model_dump().items():
            setattr(series, field, value)

        session.add(series)
        session.commit()
        session.refresh(series)
        return series


@router.delete("/series/{series_id}")
def delete_series(series_id: int):
    with Session(engine) as session:
        series = session.get(Series, series_id)
        if not series:
            raise HTTPException(status_code=404, detail="Series not found")

        session.delete(series)
        session.commit()
        return {"message": "Series deleted successfully"}
