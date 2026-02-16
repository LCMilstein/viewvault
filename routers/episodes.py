"""
Episode CRUD endpoints for ViewVault.
"""

import logging
from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select
from database import engine
from models import Episode, EpisodeCreate, Series

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/episodes/", status_code=status.HTTP_201_CREATED)
def add_episode(episode: EpisodeCreate):
    db_episode = Episode(**episode.model_dump())
    with Session(engine) as session:
        session.add(db_episode)
        session.commit()
        session.refresh(db_episode)
        return db_episode


@router.get("/episodes/")
def get_episodes(series_id: int = None):
    with Session(engine) as session:
        if series_id:
            episodes = session.exec(select(Episode).where(Episode.series_id == series_id, Episode.deleted == False)).all()
        else:
            episodes = session.exec(select(Episode).where(Episode.deleted == False)).all()
        # Explicitly convert to dicts for JSON serialization
        return [
            {
                "id": ep.id,
                "series_id": ep.series_id,
                "season_number": ep.season,  # Frontend expects season_number
                "episode_number": ep.episode,  # Frontend expects episode_number
                "title": ep.title,
                "code": ep.code,
                "air_date": ep.air_date,
                "watched": ep.watched
            }
            for ep in episodes
        ]


@router.get("/episodes/{episode_id}")
def get_episode(episode_id: int):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode or episode.deleted:
            raise HTTPException(status_code=404, detail="Episode not found")
        return episode


@router.put("/episodes/{episode_id}")
def update_episode(episode_id: int, episode_update: EpisodeCreate):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode or episode.deleted:
            raise HTTPException(status_code=404, detail="Episode not found")

        for field, value in episode_update.model_dump().items():
            setattr(episode, field, value)

        session.add(episode)
        session.commit()
        session.refresh(episode)
        return episode


@router.delete("/episodes/{episode_id}")
def delete_episode(episode_id: int):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode:
            raise HTTPException(status_code=404, detail="Episode not found")

        session.delete(episode)
        session.commit()
        return {"message": "Episode deleted successfully"}


@router.patch("/episodes/{episode_id}/watched")
def toggle_episode_watched_patch(episode_id: int):
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode or episode.deleted:
            raise HTTPException(status_code=404, detail="Episode not found")

        episode.watched = not episode.watched
        session.add(episode)
        session.commit()
        session.refresh(episode)
        return episode


@router.get("/episodes/{episode_id}/details")
def get_episode_details(episode_id: int):
    """Get enhanced episode details from TMDB"""
    with Session(engine) as session:
        episode = session.get(Episode, episode_id)
        if not episode or episode.deleted:
            raise HTTPException(status_code=404, detail="Episode not found")

        # Get series info
        series = session.get(Series, episode.series_id)
        if not series or series.deleted:
            raise HTTPException(status_code=404, detail="Series not found")

        # Get enhanced data from TMDB
        enhanced_data = {
            "id": episode.id,
            "series_id": episode.series_id,
            "season_number": episode.season,
            "episode_number": episode.episode,
            "title": episode.title,
            "air_date": episode.air_date,
            "watched": episode.watched,
            "series_title": series.title,
            "overview": None,
            "still_path": None,
            "vote_average": None,
            "vote_count": None,
            "runtime": None
        }

        # Try to get TMDB data
        if series.imdb_id and series.imdb_id.startswith('tmdb_'):
            try:
                tmdb_id = series.imdb_id.replace('tmdb_', '')
                from tmdb_service import get_episode_details as tmdb_get_episode_details
                tmdb_data = tmdb_get_episode_details(tmdb_id, episode.season, episode.episode)
                if tmdb_data:
                    enhanced_data.update({
                        "overview": tmdb_data.get('overview'),
                        "still_path": tmdb_data.get('still_path'),
                        "vote_average": tmdb_data.get('vote_average'),
                        "vote_count": tmdb_data.get('vote_count'),
                        "runtime": tmdb_data.get('runtime')
                    })
            except Exception as e:
                logger.error(f"Error fetching TMDB episode data: {e}")

        return enhanced_data
