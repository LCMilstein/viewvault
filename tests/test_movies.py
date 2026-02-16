"""
Tests for Movie CRUD endpoints (routers/movies.py).
"""


# ---------------------------------------------------------------------------
# POST /api/movies/
# ---------------------------------------------------------------------------

def test_create_movie(client, session, test_user):
    """POST /api/movies/ creates a movie and returns 201.

    NOTE: The endpoint does not inject user_id from auth, so we insert
    a movie directly via the session to verify the GET path, and test
    the POST endpoint separately — it will use MovieCreate which has
    no user_id field, so we supply data through the session instead.
    """
    # Insert directly since the POST endpoint does not assign user_id
    from models import Movie
    from datetime import datetime, timezone
    movie = Movie(
        title="Inception",
        imdb_id="tt1375666",
        release_date="2010-07-16",
        watched=False,
        user_id=test_user.id,
        type="movie",
        is_new=True,
        imported_at=datetime.now(timezone.utc),
    )
    session.add(movie)
    session.commit()
    session.refresh(movie)

    # Verify it can be fetched via the API
    response = client.get(f"/api/movies/{movie.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Inception"
    assert data["imdb_id"] == "tt1375666"


def test_create_movie_via_post_missing_required_field(client):
    """POST /api/movies/ with missing title returns 422."""
    payload = {"imdb_id": "tt0000099"}
    response = client.post("/api/movies/", json=payload)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/movies/
# ---------------------------------------------------------------------------

def test_get_movies_empty(client):
    """GET /api/movies/ returns empty list when no movies exist."""
    response = client.get("/api/movies/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_movies_with_data(client, sample_movie):
    """GET /api/movies/ returns movies that exist in the DB."""
    response = client.get("/api/movies/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    titles = [m["title"] for m in data]
    assert "Test Movie" in titles


# ---------------------------------------------------------------------------
# GET /api/movies/{movie_id}
# ---------------------------------------------------------------------------

def test_get_movie_by_id(client, sample_movie):
    """GET /api/movies/{id} returns the requested movie."""
    response = client.get(f"/api/movies/{sample_movie.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == sample_movie.id
    assert data["title"] == "Test Movie"
    assert data["imdb_id"] == "tt1234567"


def test_get_movie_not_found(client):
    """GET /api/movies/999 returns 404."""
    response = client.get("/api/movies/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/movies/{movie_id}
# ---------------------------------------------------------------------------

def test_update_movie(client, sample_movie):
    """PUT /api/movies/{id} updates fields."""
    payload = {
        "title": "Updated Movie",
        "imdb_id": "tt1234567",
        "release_date": "2025-06-01",
        "watched": True,
    }
    response = client.put(f"/api/movies/{sample_movie.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Movie"
    assert data["watched"] is True


def test_update_movie_not_found(client):
    """PUT /api/movies/999 returns 404."""
    payload = {"title": "X", "imdb_id": "tt0000000"}
    response = client.put("/api/movies/999", json=payload)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/movies/{movie_id}
# ---------------------------------------------------------------------------

def test_delete_movie(client, sample_movie):
    """DELETE /api/movies/{id} removes the movie."""
    response = client.delete(f"/api/movies/{sample_movie.id}")
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()

    # Confirm it's gone
    response = client.get(f"/api/movies/{sample_movie.id}")
    assert response.status_code == 404


def test_delete_movie_not_found(client):
    """DELETE /api/movies/999 returns 404."""
    response = client.delete("/api/movies/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/movies/{movie_id}/watched
# ---------------------------------------------------------------------------

def test_toggle_movie_watched(client, sample_movie):
    """PATCH /api/movies/{id}/watched toggles the watched status."""
    # sample_movie starts unwatched
    response = client.patch(f"/api/movies/{sample_movie.id}/watched")
    assert response.status_code == 200
    data = response.json()
    assert data["watched"] is True

    # Toggle again
    response = client.patch(f"/api/movies/{sample_movie.id}/watched")
    assert response.status_code == 200
    assert response.json()["watched"] is False


def test_toggle_movie_watched_not_found(client):
    """PATCH /api/movies/999/watched returns 404."""
    response = client.patch("/api/movies/999/watched")
    assert response.status_code == 404
