"""
Tests for List CRUD and item management endpoints (routers/lists.py).
"""
from models import ListItem


# ---------------------------------------------------------------------------
# GET /api/lists
# ---------------------------------------------------------------------------

def test_get_user_lists(client):
    """GET /api/lists returns at least the personal watchlist."""
    response = client.get("/api/lists")
    assert response.status_code == 200
    data = response.json()
    assert "lists" in data
    # There should always be a "personal" pseudo-list
    ids = [lst["id"] for lst in data["lists"]]
    assert "personal" in ids


def test_get_user_lists_includes_custom(client, sample_list):
    """GET /api/lists includes a custom list created by the user."""
    response = client.get("/api/lists")
    assert response.status_code == 200
    data = response.json()
    names = [lst["name"] for lst in data["lists"]]
    assert "My Test List" in names


# ---------------------------------------------------------------------------
# POST /api/lists
# ---------------------------------------------------------------------------

def test_create_list(client):
    """POST /api/lists creates a new custom list."""
    payload = {"name": "New List", "description": "A brand new list"}
    response = client.post("/api/lists", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "New List"
    assert data["type"] == "custom"
    assert data["item_count"] == 0


def test_create_duplicate_list(client, sample_list):
    """POST /api/lists with duplicate name returns 400."""
    payload = {"name": "My Test List"}
    response = client.post("/api/lists", json=payload)
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# PUT /api/lists/{list_id}
# ---------------------------------------------------------------------------

def test_update_list(client, sample_list):
    """PUT /api/lists/{id} updates the list."""
    payload = {"name": "Renamed List"}
    response = client.put(f"/api/lists/{sample_list.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Renamed List"


def test_update_list_not_found(client):
    """PUT /api/lists/999 returns 404."""
    payload = {"name": "X"}
    response = client.put("/api/lists/999", json=payload)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/lists/{list_id}
# ---------------------------------------------------------------------------

def test_delete_list(client, sample_list):
    """DELETE /api/lists/{id} soft-deletes the list."""
    response = client.delete(f"/api/lists/{sample_list.id}")
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()


def test_delete_list_not_found(client):
    """DELETE /api/lists/999 returns 404."""
    response = client.delete("/api/lists/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/lists/{list_id}/items — add item
# ---------------------------------------------------------------------------

def test_add_item_to_list(client, sample_list, sample_movie):
    """POST /api/lists/{id}/items adds a movie to the list."""
    payload = {"item_type": "movie", "item_id": sample_movie.id}
    response = client.post(f"/api/lists/{sample_list.id}/items", json=payload)
    assert response.status_code == 200
    assert "added" in response.json()["message"].lower()


def test_add_duplicate_item_to_list(client, session, sample_list, sample_movie):
    """Adding the same item twice returns 400."""
    # Add once
    item = ListItem(
        list_id=sample_list.id,
        item_type="movie",
        item_id=sample_movie.id,
    )
    session.add(item)
    session.commit()

    # Try adding again
    payload = {"item_type": "movie", "item_id": sample_movie.id}
    response = client.post(f"/api/lists/{sample_list.id}/items", json=payload)
    assert response.status_code == 400


def test_add_item_to_nonexistent_list(client, sample_movie):
    """POST /api/lists/999/items returns 404."""
    payload = {"item_type": "movie", "item_id": sample_movie.id}
    response = client.post("/api/lists/999/items", json=payload)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/lists/{list_id}/items
# ---------------------------------------------------------------------------

def test_get_list_items_empty(client, sample_list):
    """GET /api/lists/{id}/items returns empty structure for empty list."""
    response = client.get(f"/api/lists/{sample_list.id}/items")
    assert response.status_code == 200
    data = response.json()
    assert "movies" in data
    assert "series" in data


def test_get_list_items_with_movie(client, session, sample_list, sample_movie):
    """GET /api/lists/{id}/items includes added movie."""
    # Add item
    item = ListItem(
        list_id=sample_list.id,
        item_type="movie",
        item_id=sample_movie.id,
    )
    session.add(item)
    session.commit()

    response = client.get(f"/api/lists/{sample_list.id}/items")
    assert response.status_code == 200
    data = response.json()
    # Movie has no collection_id, so should be in standalone movies
    assert len(data["movies"]) >= 1


# ---------------------------------------------------------------------------
# DELETE /api/lists/{list_id}/items/{item_id}
# ---------------------------------------------------------------------------

def test_remove_item_from_list(client, session, sample_list, sample_movie):
    """DELETE /api/lists/{id}/items/{item_id} removes the item."""
    item = ListItem(
        list_id=sample_list.id,
        item_type="movie",
        item_id=sample_movie.id,
    )
    session.add(item)
    session.commit()

    response = client.delete(f"/api/lists/{sample_list.id}/items/{sample_movie.id}")
    assert response.status_code == 200
    assert "removed" in response.json()["message"].lower()


def test_remove_item_not_found(client, sample_list):
    """DELETE /api/lists/{id}/items/999 returns 404."""
    response = client.delete(f"/api/lists/{sample_list.id}/items/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/version
# ---------------------------------------------------------------------------

def test_version_endpoint(client):
    """GET /api/version returns version info."""
    response = client.get("/api/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
