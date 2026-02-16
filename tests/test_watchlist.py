"""
Tests for Watchlist endpoints (routers/watchlist.py).
"""
from unittest.mock import patch


# ---------------------------------------------------------------------------
# GET /api/watchlist/
# ---------------------------------------------------------------------------

def test_get_watchlist_empty(client):
    """GET /api/watchlist/ returns structure with empty lists when no data."""
    response = client.get("/api/watchlist/")
    assert response.status_code == 200
    data = response.json()
    assert "movies" in data
    assert "series" in data
    assert "collections" in data


@patch("routers.watchlist.get_collection_details_by_tmdb_id", return_value=None)
@patch("routers.watchlist.get_tmdb_series_by_imdb", return_value=None)
@patch("routers.watchlist.get_season_posters", return_value={})
def test_get_watchlist_with_data(mock_posters, mock_tmdb_series, mock_collection, client, sample_movie, sample_series):
    """GET /api/watchlist/ includes seeded movie and series."""
    response = client.get("/api/watchlist/")
    assert response.status_code == 200
    data = response.json()
    # sample_movie is standalone (no collection_id), so it should be in movies
    movie_titles = [m["title"] for m in data["movies"]]
    assert "Test Movie" in movie_titles
    # series should appear
    series_titles = [s["title"] for s in data["series"]]
    assert "Test Series" in series_titles


# ---------------------------------------------------------------------------
# GET /api/stats/
# ---------------------------------------------------------------------------

def test_get_stats_empty(client):
    """GET /api/stats/ returns zeroed stats when no data."""
    response = client.get("/api/stats/")
    assert response.status_code == 200
    data = response.json()
    assert data["movies"]["total"] == 0
    assert data["series"]["total"] == 0


def test_get_stats_with_data(client, sample_movie, sample_series):
    """GET /api/stats/ reflects seeded data."""
    response = client.get("/api/stats/")
    assert response.status_code == 200
    data = response.json()
    assert data["movies"]["total"] >= 1
    assert data["series"]["total"] >= 1


# ---------------------------------------------------------------------------
# POST /api/watchlist/movie/{id}/toggle
# ---------------------------------------------------------------------------

def test_toggle_movie_watched(client, sample_movie):
    """POST /api/watchlist/movie/{id}/toggle flips the watched flag."""
    response = client.post(f"/api/watchlist/movie/{sample_movie.id}/toggle")
    assert response.status_code == 200
    data = response.json()
    assert data["watched"] is True

    # Toggle again
    response = client.post(f"/api/watchlist/movie/{sample_movie.id}/toggle")
    assert response.status_code == 200
    assert response.json()["watched"] is False


def test_toggle_movie_not_found(client):
    """POST /api/watchlist/movie/999/toggle returns 404."""
    response = client.post("/api/watchlist/movie/999/toggle")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/watchlist/series/{id}/toggle
# ---------------------------------------------------------------------------

def test_toggle_series_watched(client, sample_series):
    """POST /api/watchlist/series/{id}/toggle marks all episodes."""
    response = client.post(f"/api/watchlist/series/{sample_series.id}/toggle")
    assert response.status_code == 200
    data = response.json()
    assert data["watched"] is True

    # Toggle off
    response = client.post(f"/api/watchlist/series/{sample_series.id}/toggle")
    assert response.status_code == 200
    assert response.json()["watched"] is False


def test_toggle_series_not_found(client):
    """POST /api/watchlist/series/999/toggle returns 404."""
    response = client.post("/api/watchlist/series/999/toggle")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/watchlist/movie/{id}
# ---------------------------------------------------------------------------

def test_remove_movie_from_watchlist(client, sample_movie):
    """DELETE /api/watchlist/movie/{id} removes the movie."""
    response = client.delete(f"/api/watchlist/movie/{sample_movie.id}")
    assert response.status_code == 200
    assert "removed" in response.json()["message"].lower()


def test_remove_movie_not_found(client):
    """DELETE /api/watchlist/movie/999 returns 404."""
    response = client.delete("/api/watchlist/movie/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/watchlist/series/{id}
# ---------------------------------------------------------------------------

def test_remove_series_from_watchlist(client, sample_series):
    """DELETE /api/watchlist/series/{id} removes the series and episodes."""
    response = client.delete(f"/api/watchlist/series/{sample_series.id}")
    assert response.status_code == 200
    assert "removed" in response.json()["message"].lower()


# ---------------------------------------------------------------------------
# DELETE /api/watchlist/clear
# ---------------------------------------------------------------------------

def test_clear_all_watchlist(client, sample_movie, sample_series):
    """DELETE /api/watchlist/clear empties the user's watchlist."""
    response = client.delete("/api/watchlist/clear")
    assert response.status_code == 200
    assert "cleared" in response.json()["message"].lower()


# ---------------------------------------------------------------------------
# GET /api/watchlist/unwatched/
# ---------------------------------------------------------------------------

def test_get_unwatched_watchlist(client, sample_movie):
    """GET /api/watchlist/unwatched/ returns unwatched items."""
    response = client.get("/api/watchlist/unwatched/")
    assert response.status_code == 200
    data = response.json()
    assert "movies" in data
    assert "series" in data
    # sample_movie is unwatched, so it should appear
    movie_ids = [m["id"] for m in data["movies"]]
    assert sample_movie.id in movie_ids


# ---------------------------------------------------------------------------
# POST /api/watchlist/{item_type}/{item_id}/interacted
# ---------------------------------------------------------------------------

def test_mark_movie_interacted(client, sample_movie):
    """POST /api/watchlist/movie/{id}/interacted clears new status."""
    response = client.post(f"/api/watchlist/movie/{sample_movie.id}/interacted")
    assert response.status_code == 200
    assert "interacted" in response.json()["message"].lower()


def test_mark_interacted_invalid_type(client):
    """POST /api/watchlist/invalid_type/1/interacted returns 400."""
    response = client.post("/api/watchlist/invalid_type/1/interacted")
    assert response.status_code == 400
