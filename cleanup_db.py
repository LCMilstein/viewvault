#!/usr/bin/env python3
"""
Database cleanup script
Removes duplicate entries and fixes database state
"""

import os
import requests
from sqlmodel import Session, select
from models import Movie, Series
from database import engine

POSTER_DIR = os.path.join("static", "posters")
os.makedirs(POSTER_DIR, exist_ok=True)
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"

def save_poster_image(poster_url, imdb_id):
    # If already local, skip
    if poster_url and poster_url.startswith("/static/posters/"):
        print(f"[SKIP] Already local: {poster_url}")
        return poster_url
    # Handle TMDB paths
    if poster_url and poster_url.startswith("/"):
        full_url = TMDB_IMAGE_BASE + poster_url
    elif poster_url and poster_url.startswith("http"):
        full_url = poster_url
    else:
        print(f"[SKIP] No valid poster_url for {imdb_id}: {poster_url}")
        return None
    try:
        print(f"[DOWNLOAD] {full_url} for {imdb_id}")
        resp = requests.get(full_url, timeout=10)
        if resp.status_code == 200:
            ext = os.path.splitext(full_url)[1]
            if not ext or len(ext) > 5:
                ext = ".jpg"
            filename = f"{imdb_id}{ext}"
            filepath = os.path.join(POSTER_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(resp.content)
            print(f"[SAVED] {filepath}")
            return f"/static/posters/{filename}"
        else:
            print(f"[ERROR] Failed to download {full_url}: status {resp.status_code}")
    except Exception as e:
        print(f"[ERROR] Exception for {imdb_id}: {e}")
    return None

def migrate_posters():
    with Session(engine) as session:
        # Movies
        movies = session.exec(select(Movie)).all()
        for m in movies:
            new_url = save_poster_image(m.poster_url, m.imdb_id)
            if new_url and new_url != m.poster_url:
                print(f"[UPDATE] Movie {m.title} ({m.imdb_id}): {m.poster_url} -> {new_url}")
                m.poster_url = new_url
                session.add(m)
        # Series
        series_list = session.exec(select(Series)).all()
        for s in series_list:
            new_url = save_poster_image(s.poster_url, s.imdb_id)
            if new_url and new_url != s.poster_url:
                print(f"[UPDATE] Series {s.title} ({s.imdb_id}): {s.poster_url} -> {new_url}")
                s.poster_url = new_url
                session.add(s)
        session.commit()
        print("[DONE] Poster migration complete.")

if __name__ == "__main__":
    migrate_posters() 