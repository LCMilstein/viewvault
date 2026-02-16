"""
Tests for health-check and API root endpoints.
"""


def test_health_endpoint(client):
    """GET /health returns healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "viewvault-server"
    assert "timestamp" in data


def test_api_root(client):
    """GET /api/ returns API info."""
    response = client.get("/api/")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "ViewVault API"
    assert "version" in data
