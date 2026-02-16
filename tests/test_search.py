"""
Tests for Search endpoints (routers/search.py).

Search endpoints hit external APIs (TMDB, TVMaze), so we mock those
and focus on testing the endpoint structure and error handling.
"""
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# GET /api/search/movies/
# ---------------------------------------------------------------------------

@patch("routers.search.movie_api")
def test_search_movies_returns_list(mock_movie_api, client):
    """GET /api/search/movies/?query=X returns a list."""
    # Mock TMDB to return empty results
    mock_movie_api.search.return_value = []
    response = client.get("/api/search/movies/?query=inception")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@patch("routers.search.movie_api")
def test_search_movies_with_results(mock_movie_api, client):
    """GET /api/search/movies/ returns properly formatted results."""
    # Create mock movie result
    mock_result = MagicMock()
    mock_result.id = 123
    mock_result.title = "Inception"
    mock_result.poster_path = "/abc.jpg"
    mock_result.release_date = "2010-07-16"
    mock_result.imdb_id = "tt1375666"

    mock_movie_api.search.return_value = [mock_result]

    response = client.get("/api/search/movies/?query=inception")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Inception"
    assert data[0]["imdb_id"] == "tt1375666"
    assert "poster_url" in data[0]


@patch("routers.search.movie_api")
def test_search_movies_api_failure(mock_movie_api, client):
    """GET /api/search/movies/ returns 500 on TMDB error."""
    mock_movie_api.search.side_effect = Exception("API down")
    response = client.get("/api/search/movies/?query=test")
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# GET /api/search/series/
# ---------------------------------------------------------------------------

@patch("routers.search.search_series_tvmaze", return_value=[])
@patch("routers.search.get_tv_details_with_imdb", return_value=None)
@patch("routers.search.tv_api")
def test_search_series_returns_list(mock_tv_api, mock_details, mock_tvmaze, client):
    """GET /api/search/series/?query=X returns a list."""
    mock_tv_api.search.return_value = []
    response = client.get("/api/search/series/?query=breaking")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@patch("routers.search.search_series_tvmaze", return_value=[])
@patch("routers.search.get_tv_details_with_imdb")
@patch("routers.search.tv_api")
def test_search_series_with_results(mock_tv_api, mock_details, mock_tvmaze, client):
    """GET /api/search/series/ returns formatted results."""
    mock_result = MagicMock()
    mock_result.id = 456
    mock_result.name = "Breaking Bad"
    mock_result.poster_path = "/bb.jpg"

    mock_tv_api.search.return_value = [mock_result]
    mock_details.return_value = {"imdb_id": "tt0903747"}

    response = client.get("/api/search/series/?query=breaking")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["title"] == "Breaking Bad"
    assert data[0]["imdb_id"] == "tt0903747"


# ---------------------------------------------------------------------------
# GET /api/search/series/tvmaze/
# ---------------------------------------------------------------------------

@patch("routers.search.search_series_tvmaze")
def test_search_tvmaze_endpoint(mock_tvmaze, client):
    """GET /api/search/series/tvmaze/?query=X hits TVMaze."""
    mock_tvmaze.return_value = [
        {"title": "Show", "imdb_id": "tt111", "poster_url": None, "episodes": []}
    ]
    response = client.get("/api/search/series/tvmaze/?query=show")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Show"


# ---------------------------------------------------------------------------
# GET /api/search/all/
# ---------------------------------------------------------------------------

@patch("routers.search.requests")
@patch("routers.search.get_tv_details_with_imdb")
@patch("routers.search.tv_api")
@patch("routers.search.movie_api")
def test_search_all_returns_combined(mock_movie_api, mock_tv_api, mock_details, mock_requests, client):
    """GET /api/search/all/?query=X returns combined movie+series results."""
    # Mock movie results
    mock_movie = MagicMock()
    mock_movie.id = 1
    mock_movie.title = "Test Movie"
    mock_movie.poster_path = "/m.jpg"
    mock_movie.release_date = "2020-01-01"
    mock_movie.imdb_id = "tt0001"
    mock_movie_api.search.return_value = [mock_movie]

    # Mock series results
    mock_series = MagicMock()
    mock_series.id = 2
    mock_series.name = "Test Series"
    mock_series.poster_path = "/s.jpg"
    mock_series.first_air_date = "2020-06-01"
    mock_tv_api.search.return_value = [mock_series]
    mock_details.return_value = {"imdb_id": "tt0002", "name": "Test Series", "poster_path": "/s.jpg", "first_air_date": "2020-06-01"}

    # Mock the broader search fallback
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"results": []}
    mock_requests.get.return_value = mock_resp
    mock_requests.utils.quote = lambda x: x

    response = client.get("/api/search/all/?query=test")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    types = [item.get("type") for item in data]
    assert "movie" in types or "series" in types
