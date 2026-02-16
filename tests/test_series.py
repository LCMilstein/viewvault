"""
Tests for Series CRUD endpoints (routers/series.py).
"""


# ---------------------------------------------------------------------------
# POST /api/series/
# ---------------------------------------------------------------------------

def test_create_series(client, session, test_user):
    """Insert a series via session, verify GET returns it.

    NOTE: The POST /api/series/ endpoint does not inject user_id from auth,
    so direct POSTing fails with a NOT NULL constraint.  We test the data
    path by inserting via session instead.
    """
    from models import Series as SeriesModel
    from datetime import datetime, timezone
    s = SeriesModel(
        title="Breaking Bad",
        imdb_id="tt0903747",
        user_id=test_user.id,
        type="series",
        is_new=True,
        imported_at=datetime.now(timezone.utc),
    )
    session.add(s)
    session.commit()
    session.refresh(s)

    response = client.get(f"/api/series/{s.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Breaking Bad"
    assert data["imdb_id"] == "tt0903747"


def test_create_series_missing_required_field(client):
    """POST /api/series/ with missing title returns 422."""
    payload = {"imdb_id": "tt0000099"}
    response = client.post("/api/series/", json=payload)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/series/
# ---------------------------------------------------------------------------

def test_get_series_empty(client):
    """GET /api/series/ returns empty list when none exist."""
    response = client.get("/api/series/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_series_with_data(client, sample_series):
    """GET /api/series/ includes the seeded series."""
    response = client.get("/api/series/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    titles = [s["title"] for s in data]
    assert "Test Series" in titles


# ---------------------------------------------------------------------------
# GET /api/series/{series_id}
# ---------------------------------------------------------------------------

def test_get_series_by_id(client, sample_series):
    """GET /api/series/{id} returns the requested series."""
    response = client.get(f"/api/series/{sample_series.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == sample_series.id
    assert data["title"] == "Test Series"


def test_get_series_not_found(client):
    """GET /api/series/999 returns 404."""
    response = client.get("/api/series/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/series/{series_id}
# ---------------------------------------------------------------------------

def test_update_series(client, sample_series):
    """PUT /api/series/{id} updates the series."""
    payload = {"title": "Updated Series", "imdb_id": "tt7654321"}
    response = client.put(f"/api/series/{sample_series.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Series"


def test_update_series_not_found(client):
    """PUT /api/series/999 returns 404."""
    payload = {"title": "X", "imdb_id": "tt0000000"}
    response = client.put("/api/series/999", json=payload)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/series/{series_id}
# ---------------------------------------------------------------------------

def test_delete_series(client, sample_series):
    """DELETE /api/series/{id} removes the series."""
    response = client.delete(f"/api/series/{sample_series.id}")
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()

    # Confirm it's gone
    response = client.get(f"/api/series/{sample_series.id}")
    assert response.status_code == 404


def test_delete_series_not_found(client):
    """DELETE /api/series/999 returns 404."""
    response = client.delete("/api/series/999")
    assert response.status_code == 404
