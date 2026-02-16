"""
Shared fixtures for ViewVault API tests.

Uses an in-memory SQLite database so tests never touch production data.
Auth dependencies are overridden to inject a mock user/admin without tokens.
"""

import os
import sys
import pytest

# Ensure the app root is on the path so imports resolve
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# httpx / starlette compatibility shim
# ---------------------------------------------------------------------------
# starlette 0.27 passes `app=...` to httpx.Client.__init__, but httpx 0.28+
# removed that keyword argument.  Patch httpx.Client.__init__ to silently
# ignore `app` so the existing TestClient code works unmodified.
import httpx

_original_httpx_client_init = httpx.Client.__init__


def _patched_httpx_client_init(self, *args, **kwargs):
    kwargs.pop("app", None)
    return _original_httpx_client_init(self, *args, **kwargs)


httpx.Client.__init__ = _patched_httpx_client_init  # type: ignore[assignment]

from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool

from models import User, Movie, Series, Episode, List, ListItem


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(name="engine")
def engine_fixture():
    """Create a fresh in-memory SQLite engine for each test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture(name="session")
def session_fixture(engine):
    """Yield a session bound to the test engine."""
    with Session(engine) as session:
        yield session


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(name="test_user")
def test_user_fixture(session):
    """Insert and return a regular test user."""
    user = User(
        id=1,
        username="testuser",
        email="test@example.com",
        hashed_password="fakehash",
        is_admin=False,
        auth_provider="local",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture(name="admin_user")
def admin_user_fixture(session):
    """Insert and return an admin test user."""
    user = User(
        id=2,
        username="adminuser",
        email="admin@example.com",
        hashed_password="fakehash",
        is_admin=True,
        auth_provider="local",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# App / client fixtures
# ---------------------------------------------------------------------------

# All modules that do ``from database import engine`` at the top level.
# We must patch their local ``engine`` binding so ``Session(engine)`` in
# router code points at the in-memory test DB.
_ENGINE_MODULES = [
    "database",
    "deps",
    "security",
    "routers.movies",
    "routers.series",
    "routers.episodes",
    "routers.watchlist",
    "routers.lists",
    "routers.search",
    "routers.admin",
    "routers.auth",
    "routers.imports",
    "routers.jellyfin",
    "routers.notifications",
]


def _patch_all_engines(test_engine):
    """Replace the ``engine`` attribute in every module that uses it."""
    import sys
    originals = {}
    for mod_name in _ENGINE_MODULES:
        mod = sys.modules.get(mod_name)
        if mod and hasattr(mod, "engine"):
            originals[mod_name] = mod.engine
            mod.engine = test_engine
    return originals


def _restore_all_engines(originals):
    import sys
    for mod_name, orig in originals.items():
        mod = sys.modules.get(mod_name)
        if mod:
            mod.engine = orig


@pytest.fixture(name="client")
def client_fixture(engine, test_user):
    """
    TestClient with auth overridden to return `test_user`.

    The database engine is also monkey-patched so every router
    that opens a Session(engine) hits the in-memory DB.
    """
    # Import the app so all modules are loaded before we patch
    from main import app
    from security import get_current_user, get_current_admin_user
    import deps

    # Patch all engine references
    originals = _patch_all_engines(engine)

    # Patch deps.get_session to use test engine
    def _override_get_session():
        with Session(engine) as s:
            yield s

    # Override auth deps to return the test user without a real JWT.
    # NOTE: We do NOT override get_current_admin_user here so that admin
    # endpoints correctly return 403 for non-admin users.
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[deps.get_session] = _override_get_session

    with TestClient(app) as c:
        yield c

    # Cleanup
    app.dependency_overrides.clear()
    _restore_all_engines(originals)


@pytest.fixture(name="admin_client")
def admin_client_fixture(engine, admin_user):
    """TestClient with auth overridden to return `admin_user`."""
    from main import app
    from security import get_current_user, get_current_admin_user
    import deps

    originals = _patch_all_engines(engine)

    def _override_get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_current_user] = lambda: admin_user
    app.dependency_overrides[get_current_admin_user] = lambda: admin_user
    app.dependency_overrides[deps.get_session] = _override_get_session

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    _restore_all_engines(originals)


# ---------------------------------------------------------------------------
# Seed-data helpers
# ---------------------------------------------------------------------------

@pytest.fixture(name="sample_movie")
def sample_movie_fixture(session, test_user):
    """Insert and return a sample movie."""
    movie = Movie(
        title="Test Movie",
        imdb_id="tt1234567",
        user_id=test_user.id,
        release_date="2024-01-15",
        runtime=120,
        watched=False,
        type="movie",
    )
    session.add(movie)
    session.commit()
    session.refresh(movie)
    return movie


@pytest.fixture(name="sample_series")
def sample_series_fixture(session, test_user):
    """Insert and return a sample series with 2 episodes."""
    series = Series(
        title="Test Series",
        imdb_id="tt7654321",
        user_id=test_user.id,
        type="series",
    )
    session.add(series)
    session.commit()
    session.refresh(series)

    for i in range(1, 3):
        ep = Episode(
            series_id=series.id,
            season=1,
            episode=i,
            title=f"Episode {i}",
            code=f"S01E{i:02d}",
            watched=False,
        )
        session.add(ep)
    session.commit()
    session.refresh(series)
    return series


@pytest.fixture(name="sample_list")
def sample_list_fixture(session, test_user):
    """Insert and return a sample custom list."""
    lst = List(
        name="My Test List",
        user_id=test_user.id,
        type="custom",
        description="A list for testing",
    )
    session.add(lst)
    session.commit()
    session.refresh(lst)
    return lst
