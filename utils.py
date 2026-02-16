"""
Shared utility functions for ViewVault routers.

Pure helper functions with no FastAPI dependencies — safe to import anywhere.
"""

import os
import re
import logging
import requests

from deps import POSTER_DIR

logger = logging.getLogger(__name__)


def extract_imdb_id_from_url(url: str):
    """Extract IMDB ID (tt1234567) from an IMDB or similar URL."""
    url = url.strip()
    if url.startswith('@'):
        url = url[1:].strip()
    match = re.search(r"tt\d{7,8}", url)
    if match:
        return match.group(0)
    return None


def get_imdb_id_from_tvmaze_url(url: str):
    """Extract IMDB ID from a TVMaze show or episode URL via the TVMaze API."""
    show_match = re.search(r"tvmaze.com/shows/(\d+)", url)
    ep_match = re.search(r"tvmaze.com/episodes/(\d+)", url)
    if show_match:
        show_id = show_match.group(1)
        resp = requests.get(f"https://api.tvmaze.com/shows/{show_id}")
        if resp.ok:
            data = resp.json()
            return data.get('externals', {}).get('imdb')
    elif ep_match:
        ep_id = ep_match.group(1)
        resp = requests.get(f"https://api.tvmaze.com/episodes/{ep_id}")
        if resp.ok:
            data = resp.json()
            show = data.get('show')
            if show:
                return show.get('externals', {}).get('imdb')
    return None


def get_series_from_tvmaze_by_imdb(imdb_id: str):
    """Fetch series info from TVMaze by IMDB ID."""
    url = f"https://api.tvmaze.com/lookup/shows?imdb={imdb_id}"
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "title": data.get("name"),
                "poster_url": (
                    data.get("image", {}).get("medium")
                    or data.get("image", {}).get("original")
                ),
            }
    except Exception as e:
        logger.error(f"TVMaze lookup failed: {e}")
    return None


def fetch_and_store_poster_thumb(poster_url):
    """Download a poster thumbnail and return its binary content."""
    try:
        if poster_url and poster_url.startswith('http'):
            resp = requests.get(poster_url, timeout=5)
            if resp.status_code == 200:
                return resp.content
    except Exception:
        pass
    return None


def save_poster_image(poster_url, imdb_id):
    """Download a poster image, save to POSTER_DIR, and return the static URL path."""
    if not poster_url or not poster_url.startswith("http"):
        return None
    try:
        resp = requests.get(poster_url, timeout=10)
        if resp.status_code == 200:
            ext = os.path.splitext(poster_url)[1]
            if not ext or len(ext) > 5:
                ext = ".jpg"
            filename = f"{imdb_id}{ext}"
            filepath = os.path.join(POSTER_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(resp.content)
            return f"/static/posters/{filename}"
    except Exception as e:
        logger.error(f"Failed to save poster image: {e}")
    return None
