"""
Tests for Episode CRUD endpoints (routers/episodes.py).
"""
from sqlmodel import select
from models import Episode


# ---------------------------------------------------------------------------
# POST /api/episodes/
# ---------------------------------------------------------------------------

def test_create_episode(client, sample_series):
    """POST /api/episodes/ creates an episode and returns 201."""
    payload = {
        "series_id": sample_series.id,
        "season": 2,
        "episode": 1,
        "title": "New Episode",
        "code": "S02E01",
        "watched": False,
    }
    response = client.post("/api/episodes/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "New Episode"
    assert data["code"] == "S02E01"
    assert data["series_id"] == sample_series.id


# ---------------------------------------------------------------------------
# GET /api/episodes/
# ---------------------------------------------------------------------------

def test_get_episodes_all(client, sample_series):
    """GET /api/episodes/ returns all episodes."""
    response = client.get("/api/episodes/")
    assert response.status_code == 200
    data = response.json()
    # sample_series fixture creates 2 episodes
    assert len(data) >= 2


def test_get_episodes_by_series(client, sample_series):
    """GET /api/episodes/?series_id=X returns only episodes for that series."""
    response = client.get(f"/api/episodes/?series_id={sample_series.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    for ep in data:
        assert ep["series_id"] == sample_series.id


# ---------------------------------------------------------------------------
# GET /api/episodes/{episode_id}
# ---------------------------------------------------------------------------

def test_get_episode_by_id(client, session, sample_series):
    """GET /api/episodes/{id} returns the requested episode."""
    ep = session.exec(select(Episode).where(Episode.series_id == sample_series.id)).first()
    response = client.get(f"/api/episodes/{ep.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == ep.id


def test_get_episode_not_found(client):
    """GET /api/episodes/999 returns 404."""
    response = client.get("/api/episodes/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/episodes/{episode_id}
# ---------------------------------------------------------------------------

def test_update_episode(client, session, sample_series):
    """PUT /api/episodes/{id} updates the episode."""
    ep = session.exec(select(Episode).where(Episode.series_id == sample_series.id)).first()
    payload = {
        "series_id": sample_series.id,
        "season": 1,
        "episode": 1,
        "title": "Updated Episode Title",
        "code": "S01E01",
    }
    response = client.put(f"/api/episodes/{ep.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Episode Title"


def test_update_episode_not_found(client, sample_series):
    """PUT /api/episodes/999 returns 404."""
    payload = {
        "series_id": sample_series.id,
        "season": 1,
        "episode": 1,
        "title": "X",
        "code": "S01E01",
    }
    response = client.put("/api/episodes/999", json=payload)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/episodes/{episode_id}
# ---------------------------------------------------------------------------

def test_delete_episode(client, session, sample_series):
    """DELETE /api/episodes/{id} removes the episode."""
    ep = session.exec(select(Episode).where(Episode.series_id == sample_series.id)).first()
    response = client.delete(f"/api/episodes/{ep.id}")
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()


def test_delete_episode_not_found(client):
    """DELETE /api/episodes/999 returns 404."""
    response = client.delete("/api/episodes/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/episodes/{episode_id}/watched
# ---------------------------------------------------------------------------

def test_toggle_episode_watched(client, session, sample_series):
    """PATCH /api/episodes/{id}/watched toggles watched status."""
    ep = session.exec(select(Episode).where(Episode.series_id == sample_series.id)).first()
    assert ep.watched is False

    # Toggle on
    response = client.patch(f"/api/episodes/{ep.id}/watched")
    assert response.status_code == 200
    assert response.json()["watched"] is True

    # Toggle off
    response = client.patch(f"/api/episodes/{ep.id}/watched")
    assert response.status_code == 200
    assert response.json()["watched"] is False


def test_toggle_episode_watched_not_found(client):
    """PATCH /api/episodes/999/watched returns 404."""
    response = client.patch("/api/episodes/999/watched")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/episodes/{episode_id}/details
# ---------------------------------------------------------------------------

def test_get_episode_details(client, session, sample_series):
    """GET /api/episodes/{id}/details returns enhanced episode data."""
    ep = session.exec(select(Episode).where(Episode.series_id == sample_series.id)).first()
    response = client.get(f"/api/episodes/{ep.id}/details")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == ep.id
    assert data["series_title"] == "Test Series"
    assert "overview" in data
    assert "still_path" in data


def test_get_episode_details_not_found(client):
    """GET /api/episodes/999/details returns 404."""
    response = client.get("/api/episodes/999/details")
    assert response.status_code == 404
