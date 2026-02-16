"""
Tests for Admin endpoints (routers/admin.py).

Uses admin_client for admin-only endpoints and client (regular user) to
verify that non-admins get 403 Forbidden.
"""
from models import Movie, Series, Episode, User


# ---------------------------------------------------------------------------
# Authorization — regular user gets 403 for admin endpoints
# ---------------------------------------------------------------------------

def test_admin_users_forbidden_for_regular_user(client):
    """GET /api/admin/users returns 403 for a non-admin user."""
    response = client.get("/api/admin/users")
    assert response.status_code == 403


def test_admin_dashboard_forbidden_for_regular_user(client):
    """GET /api/admin/dashboard returns 403 for a non-admin user."""
    response = client.get("/api/admin/dashboard")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/admin/users  (admin)
# ---------------------------------------------------------------------------

def test_get_admin_users(admin_client):
    """GET /api/admin/users returns list of users."""
    response = admin_client.get("/api/admin/users")
    assert response.status_code == 200
    data = response.json()
    assert "users" in data
    # At minimum the admin user is in there
    assert len(data["users"]) >= 1


# ---------------------------------------------------------------------------
# GET /api/admin/users/{user_id}  (admin)
# ---------------------------------------------------------------------------

def test_get_admin_user_detail(admin_client, admin_user):
    """GET /api/admin/users/{id} returns user detail."""
    response = admin_client.get(f"/api/admin/users/{admin_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "adminuser"


def test_get_admin_user_not_found(admin_client):
    """GET /api/admin/users/999 returns 404."""
    response = admin_client.get("/api/admin/users/999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/admin/users/{user_id}  (admin)
# ---------------------------------------------------------------------------

def test_update_admin_user(admin_client, session):
    """PUT /api/admin/users/{id} updates user fields."""
    # Create a target user to update
    user = User(
        id=10,
        username="target_user",
        email="target@test.com",
        hashed_password="fake",
        is_admin=False,
        auth_provider="local",
    )
    session.add(user)
    session.commit()

    response = admin_client.put(
        f"/api/admin/users/{user.id}",
        json={"is_active": False},
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# GET /api/admin/dashboard  (admin)
# ---------------------------------------------------------------------------

def test_admin_dashboard(admin_client):
    """GET /api/admin/dashboard returns stats."""
    response = admin_client.get("/api/admin/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert "total_users" in data
    assert "total_movies" in data
    assert "total_series" in data
    assert "admin_users" in data


# ---------------------------------------------------------------------------
# GET /api/admin/usage-stats  (admin)
# ---------------------------------------------------------------------------

def test_admin_usage_stats(admin_client):
    """GET /api/admin/usage-stats returns detailed usage data."""
    response = admin_client.get("/api/admin/usage-stats")
    assert response.status_code == 200
    data = response.json()
    assert "users" in data
    assert "content" in data
    assert "per_user" in data


# ---------------------------------------------------------------------------
# POST /api/admin/users/{user_id}/clear-data  (admin)
# ---------------------------------------------------------------------------

def test_clear_user_data(admin_client, session):
    """POST /api/admin/users/{id}/clear-data soft-deletes user content."""
    # Create user with data
    user = User(
        id=20,
        username="data_user",
        email="data@test.com",
        hashed_password="fake",
        is_admin=False,
        auth_provider="local",
    )
    session.add(user)
    session.commit()

    movie = Movie(
        title="User Movie",
        imdb_id="tt9999999",
        user_id=user.id,
        type="movie",
    )
    session.add(movie)
    session.commit()

    response = admin_client.post(f"/api/admin/users/{user.id}/clear-data")
    assert response.status_code == 200
    assert "cleared" in response.json()["message"].lower()


# ---------------------------------------------------------------------------
# POST /api/admin/users/{user_id}/toggle-admin  (admin)
# ---------------------------------------------------------------------------

def test_toggle_admin_status(admin_client, session):
    """POST /api/admin/users/{id}/toggle-admin changes admin flag."""
    user = User(
        id=30,
        username="toggleuser",
        email="toggle@test.com",
        hashed_password="fake",
        is_admin=False,
        auth_provider="local",
    )
    session.add(user)
    session.commit()

    response = admin_client.post(
        f"/api/admin/users/{user.id}/toggle-admin",
        json={"is_admin": True},
    )
    assert response.status_code == 200


def test_toggle_own_admin_status_fails(admin_client, admin_user):
    """Admin cannot toggle their own admin status."""
    response = admin_client.post(
        f"/api/admin/users/{admin_user.id}/toggle-admin",
        json={"is_admin": False},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# DELETE /api/admin/users/{user_id}  (admin)
# ---------------------------------------------------------------------------

def test_delete_user(admin_client, session):
    """DELETE /api/admin/users/{id} hard-deletes a user."""
    user = User(
        id=40,
        username="deleteuser",
        email="delete@test.com",
        hashed_password="fake",
        is_admin=False,
        auth_provider="local",
    )
    session.add(user)
    session.commit()

    response = admin_client.delete(f"/api/admin/users/{user.id}")
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()


def test_admin_cannot_delete_self(admin_client, admin_user):
    """Admin cannot delete their own account."""
    response = admin_client.delete(f"/api/admin/users/{admin_user.id}")
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/admin/remove-duplicates
# ---------------------------------------------------------------------------

def test_remove_duplicates(admin_client):
    """POST /api/admin/remove-duplicates runs without error."""
    response = admin_client.post("/api/admin/remove-duplicates")
    assert response.status_code == 200
    data = response.json()
    assert "removed_count" in data


# ---------------------------------------------------------------------------
# GET /api/test-db  (admin)
# ---------------------------------------------------------------------------

def test_test_db_endpoint(admin_client):
    """GET /api/test-db returns DB connection status."""
    response = admin_client.get("/api/test-db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["database"] == "connected"


# ---------------------------------------------------------------------------
# GET /api/lists/test  (public debug endpoint)
# ---------------------------------------------------------------------------

def test_lists_test_endpoint(client):
    """GET /api/lists/test returns ok (no auth needed)."""
    response = client.get("/api/lists/test")
    assert response.status_code == 200
    assert "working" in response.json()["message"].lower()
