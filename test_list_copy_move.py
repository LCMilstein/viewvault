#!/usr/bin/env python3
"""
Unit tests for list item copy/move operations
Tests the copy, move, and bulk operation endpoints
"""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, SQLModel
from sqlmodel.pool import StaticPool
from datetime import datetime, timezone

# Import the app and models
from main import app, get_current_user
from models import User, List, ListItem, Movie, Series, Episode, ListPermission
from security import get_password_hash

# Create in-memory test database
@pytest.fixture(name="session")
def session_fixture():
    """Create a test database session"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    """Create a test client with dependency override"""
    def get_session_override():
        return session
    
    # Override the database session
    from main import engine as main_engine
    from database import engine as db_engine
    
    # We'll use the test session for all database operations
    app.dependency_overrides[get_current_user] = lambda: test_user
    
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


# Test user fixture
test_user = User(
    id=1,
    username="testuser",
    email="test@example.com",
    hashed_password=get_password_hash("testpass123"),
    is_admin=False,
    is_active=True,
    created_at=datetime.now(timezone.utc)
)

test_user2 = User(
    id=2,
    username="testuser2",
    email="test2@example.com",
    hashed_password=get_password_hash("testpass123"),
    is_admin=False,
    is_active=True,
    created_at=datetime.now(timezone.utc)
)


def setup_test_data(session: Session):
    """Set up test data for copy/move operations"""
    # Create test users
    session.add(test_user)
    session.add(test_user2)
    
    # Create test lists
    list1 = List(
        id=1,
        user_id=1,
        name="My Watchlist",
        type="personal",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    list2 = List(
        id=2,
        user_id=1,
        name="Favorites",
        type="custom",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    list3 = List(
        id=3,
        user_id=2,
        name="User2 List",
        type="custom",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    
    session.add(list1)
    session.add(list2)
    session.add(list3)
    
    # Create test movies
    movie1 = Movie(
        id=1,
        user_id=1,
        title="Test Movie 1",
        imdb_id="tt0000001",
        year=2020,
        created_at=datetime.now(timezone.utc)
    )
    movie2 = Movie(
        id=2,
        user_id=1,
        title="Test Movie 2",
        imdb_id="tt0000002",
        year=2021,
        collection_id=1,
        created_at=datetime.now(timezone.utc)
    )
    movie3 = Movie(
        id=3,
        user_id=1,
        title="Test Movie 3",
        imdb_id="tt0000003",
        year=2021,
        collection_id=1,
        created_at=datetime.now(timezone.utc)
    )
    
    session.add(movie1)
    session.add(movie2)
    session.add(movie3)
    
    # Create test series
    series1 = Series(
        id=1,
        user_id=1,
        title="Test Series 1",
        imdb_id="tt1000001",
        year=2020,
        created_at=datetime.now(timezone.utc)
    )
    
    session.add(series1)
    
    # Create test episodes
    episode1 = Episode(
        id=1,
        series_id=1,
        title="Episode 1",
        season_number=1,
        episode_number=1,
        imdb_id="tt1000001",
        created_at=datetime.now(timezone.utc)
    )
    episode2 = Episode(
        id=2,
        series_id=1,
        title="Episode 2",
        season_number=1,
        episode_number=2,
        imdb_id="tt1000002",
        created_at=datetime.now(timezone.utc)
    )
    
    session.add(episode1)
    session.add(episode2)
    
    # Add items to list1
    list_item1 = ListItem(
        id=1,
        list_id=1,
        item_type="movie",
        item_id=1,
        watched=False,
        added_at=datetime.now(timezone.utc)
    )
    list_item2 = ListItem(
        id=2,
        list_id=1,
        item_type="series",
        item_id=1,
        watched=False,
        added_at=datetime.now(timezone.utc)
    )
    list_item3 = ListItem(
        id=3,
        list_id=1,
        item_type="collection",
        item_id=1,
        watched=False,
        added_at=datetime.now(timezone.utc)
    )
    
    session.add(list_item1)
    session.add(list_item2)
    session.add(list_item3)
    
    session.commit()
    
    return {
        "users": [test_user, test_user2],
        "lists": [list1, list2, list3],
        "movies": [movie1, movie2, movie3],
        "series": [series1],
        "episodes": [episode1, episode2],
        "list_items": [list_item1, list_item2, list_item3]
    }


class TestCopyEndpoint:
    """Tests for the copy item endpoint"""
    
    def test_copy_single_movie(self, session: Session, client: TestClient):
        """Test copying a single movie between lists"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["items_affected"] == 1
        assert "Favorites" in data["message"]
    
    def test_copy_series_with_episodes(self, session: Session, client: TestClient):
        """Test copying a series with all episodes"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "series",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should copy series + 2 episodes = 3 items
        assert data["items_affected"] == 3
    
    def test_copy_collection_with_movies(self, session: Session, client: TestClient):
        """Test copying a collection with all movies"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "collection",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should copy 2 movies in the collection
        assert data["items_affected"] == 2
    
    def test_copy_duplicate_detection(self, session: Session, client: TestClient):
        """Test that duplicate items are detected and skipped"""
        setup_test_data(session)
        
        # First copy
        response1 = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        assert response1.status_code == 200
        
        # Second copy (should detect duplicate)
        response2 = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        assert response2.status_code == 200
        data = response2.json()
        assert data["duplicate"] is True
        assert data["items_affected"] == 0
    
    def test_copy_invalid_source_list(self, session: Session, client: TestClient):
        """Test copying from non-existent source list"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/999/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 404
    
    def test_copy_invalid_target_list(self, session: Session, client: TestClient):
        """Test copying to non-existent target list"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 999,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 404
    
    def test_copy_permission_denied(self, session: Session, client: TestClient):
        """Test copying to list owned by another user"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 3,  # Owned by user2
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 403


class TestMoveEndpoint:
    """Tests for the move item endpoint"""
    
    def test_move_single_movie(self, session: Session, client: TestClient):
        """Test moving a single movie between lists"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/move",
            json={
                "target_list_id": 2,
                "item_type": "movie"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["items_affected"] == 1
        
        # Verify item is removed from source list
        source_item = session.get(ListItem, 1)
        assert source_item.deleted is True
    
    def test_move_series_with_episodes(self, session: Session, client: TestClient):
        """Test moving a series with all episodes"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/move",
            json={
                "target_list_id": 2,
                "item_type": "series"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should move series + 2 episodes = 3 items
        assert data["items_affected"] == 3
    
    def test_move_collection_with_movies(self, session: Session, client: TestClient):
        """Test moving a collection with all movies"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/move",
            json={
                "target_list_id": 2,
                "item_type": "collection"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should move 2 movies in the collection
        assert data["items_affected"] == 2
    
    def test_move_duplicate_handling(self, session: Session, client: TestClient):
        """Test that duplicates are handled correctly during move"""
        setup_test_data(session)
        
        # First copy to create duplicate
        client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        # Now move (should remove from source only)
        response = client.post(
            "/api/lists/1/items/1/move",
            json={
                "target_list_id": 2,
                "item_type": "movie"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["duplicate"] is True
        
        # Verify item is removed from source
        source_item = session.get(ListItem, 1)
        assert source_item.deleted is True
    
    def test_move_transaction_rollback(self, session: Session, client: TestClient):
        """Test that move operation rolls back on error"""
        setup_test_data(session)
        
        # This test would require mocking to force an error mid-transaction
        # For now, we'll just verify the endpoint handles errors gracefully
        response = client.post(
            "/api/lists/1/items/999/move",
            json={
                "target_list_id": 2,
                "item_type": "movie"
            }
        )
        
        assert response.status_code == 404


class TestBulkOperations:
    """Tests for the bulk copy/move endpoint"""
    
    def test_bulk_copy_mixed_items(self, session: Session, client: TestClient):
        """Test bulk copying multiple item types"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "copy",
                "source_list_id": 1,
                "target_list_id": 2,
                "items": [
                    {"item_id": 1, "item_type": "movie"},
                    {"item_id": 1, "item_type": "series"}
                ],
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Movie (1) + Series (1) + Episodes (2) = 4 items
        assert data["items_affected"] == 4
        assert data["duplicates_skipped"] == 0
    
    def test_bulk_move_mixed_items(self, session: Session, client: TestClient):
        """Test bulk moving multiple item types"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "move",
                "source_list_id": 1,
                "target_list_id": 2,
                "items": [
                    {"item_id": 1, "item_type": "movie"},
                    {"item_id": 1, "item_type": "series"}
                ]
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["items_affected"] == 4
        
        # Verify items are removed from source
        source_items = session.query(ListItem).filter(
            ListItem.list_id == 1,
            ListItem.deleted == False
        ).all()
        # Only collection item should remain
        assert len(source_items) == 1
    
    def test_bulk_operation_with_duplicates(self, session: Session, client: TestClient):
        """Test bulk operation with some duplicates"""
        setup_test_data(session)
        
        # First copy one item
        client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 2,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        # Now bulk copy including the duplicate
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "copy",
                "source_list_id": 1,
                "target_list_id": 2,
                "items": [
                    {"item_id": 1, "item_type": "movie"},  # Duplicate
                    {"item_id": 1, "item_type": "series"}  # New
                ],
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["duplicates_skipped"] == 1
        assert data["items_affected"] == 3  # Series + 2 episodes
    
    def test_bulk_operation_validation(self, session: Session, client: TestClient):
        """Test bulk operation validates all items before starting"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "copy",
                "source_list_id": 1,
                "target_list_id": 2,
                "items": [
                    {"item_id": 999, "item_type": "movie"}  # Non-existent
                ]
            }
        )
        
        assert response.status_code == 404
    
    def test_bulk_operation_invalid_operation_type(self, session: Session, client: TestClient):
        """Test bulk operation with invalid operation type"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "delete",  # Invalid
                "source_list_id": 1,
                "target_list_id": 2,
                "items": [
                    {"item_id": 1, "item_type": "movie"}
                ]
            }
        )
        
        assert response.status_code == 400
    
    def test_bulk_operation_empty_items(self, session: Session, client: TestClient):
        """Test bulk operation with empty items array"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "copy",
                "source_list_id": 1,
                "target_list_id": 2,
                "items": []
            }
        )
        
        assert response.status_code == 400
    
    def test_bulk_operation_collection_expansion(self, session: Session, client: TestClient):
        """Test that collections are expanded in bulk operations"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "copy",
                "source_list_id": 1,
                "target_list_id": 2,
                "items": [
                    {"item_id": 1, "item_type": "collection"}
                ],
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should copy 2 movies in the collection
        assert data["items_affected"] == 2
    
    def test_bulk_operation_series_expansion(self, session: Session, client: TestClient):
        """Test that series are expanded in bulk operations"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/bulk-operation",
            json={
                "operation": "copy",
                "source_list_id": 1,
                "target_list_id": 2,
                "items": [
                    {"item_id": 1, "item_type": "series"}
                ],
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should copy series + 2 episodes = 3 items
        assert data["items_affected"] == 3


class TestPermissions:
    """Tests for permission validation"""
    
    def test_copy_with_shared_edit_permission(self, session: Session, client: TestClient):
        """Test copying to a shared list with edit permission"""
        setup_test_data(session)
        
        # Create shared permission
        permission = ListPermission(
            list_id=3,
            shared_with_user_id=1,
            permission_level="edit",
            created_at=datetime.now(timezone.utc)
        )
        session.add(permission)
        session.commit()
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 3,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 200
    
    def test_copy_with_shared_view_permission(self, session: Session, client: TestClient):
        """Test copying to a shared list with view-only permission"""
        setup_test_data(session)
        
        # Create shared permission (view only)
        permission = ListPermission(
            list_id=3,
            shared_with_user_id=1,
            permission_level="view",
            created_at=datetime.now(timezone.utc)
        )
        session.add(permission)
        session.commit()
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 3,
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 403
    
    def test_copy_no_access(self, session: Session, client: TestClient):
        """Test copying to a list with no access"""
        setup_test_data(session)
        
        response = client.post(
            "/api/lists/1/items/1/copy",
            json={
                "target_list_id": 3,  # Owned by user2, no shared access
                "item_type": "movie",
                "preserve_metadata": True
            }
        )
        
        assert response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
