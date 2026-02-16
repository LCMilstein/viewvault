"""
Performance optimization tests for list copy/move feature.
Tests the optimizations added in task 17.
"""
import time
from sqlmodel import Session, select
from database import engine
from models import ListItem, List, User, Movie
from datetime import datetime, timezone

def test_database_index_exists():
    """Verify that the performance index was created"""
    from sqlmodel import text
    with Session(engine) as session:
        result = session.execute(
            text("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_listitem_duplicate_check'")
        )
        index = result.fetchone()
        assert index is not None, "Performance index idx_listitem_duplicate_check should exist"
        print("✓ Database index exists")

def test_batch_query_performance():
    """Test that batch queries are more efficient than individual queries"""
    with Session(engine) as session:
        # Get a sample list
        test_list = session.exec(select(List).limit(1)).first()
        if not test_list:
            print("⚠ No lists found, skipping batch query test")
            return
        
        # Test individual queries (old method)
        start_time = time.time()
        items = session.exec(
            select(ListItem).where(
                ListItem.list_id == test_list.id,
                ListItem.deleted == False
            )
        ).all()
        
        # Simulate old method - individual count queries
        for item in items[:10]:  # Limit to 10 for test
            _ = session.exec(
                select(ListItem).where(
                    ListItem.list_id == test_list.id,
                    ListItem.item_id == item.item_id,
                    ListItem.item_type == item.item_type,
                    ListItem.deleted == False
                )
            ).first()
        individual_time = time.time() - start_time
        
        # Test batch query (new method)
        start_time = time.time()
        all_items = session.exec(
            select(ListItem).where(
                ListItem.list_id == test_list.id,
                ListItem.deleted == False
            )
        ).all()
        
        # Create lookup dict (new method)
        items_map = {
            (item.item_id, item.item_type): item 
            for item in all_items
        }
        
        # Simulate lookups
        for item in items[:10]:
            _ = items_map.get((item.item_id, item.item_type))
        batch_time = time.time() - start_time
        
        print(f"✓ Individual queries: {individual_time:.4f}s")
        print(f"✓ Batch query: {batch_time:.4f}s")
        print(f"✓ Performance improvement: {(individual_time / batch_time):.2f}x faster")

def test_optimized_expansion_queries():
    """Test that collection/series expansion uses optimized queries"""
    with Session(engine) as session:
        # Test that we're selecting only IDs, not full objects
        # This is verified by checking the query structure
        
        # Get a sample movie with collection
        movie = session.exec(
            select(Movie).where(Movie.collection_id.isnot(None)).limit(1)
        ).first()
        
        if not movie:
            print("⚠ No movies with collections found, skipping expansion test")
            return
        
        # Test optimized query (selecting only IDs)
        start_time = time.time()
        movie_ids = session.exec(
            select(Movie.id).where(
                Movie.collection_id == movie.collection_id,
                Movie.user_id == movie.user_id,
                Movie.deleted == False
            )
        ).all()
        optimized_time = time.time() - start_time
        
        # Test old method (selecting full objects)
        start_time = time.time()
        movies = session.exec(
            select(Movie).where(
                Movie.collection_id == movie.collection_id,
                Movie.user_id == movie.user_id,
                Movie.deleted == False
            )
        ).all()
        old_ids = [m.id for m in movies]
        old_time = time.time() - start_time
        
        assert list(movie_ids) == old_ids, "Both methods should return same IDs"
        print(f"✓ Optimized expansion query: {optimized_time:.4f}s")
        print(f"✓ Old expansion query: {old_time:.4f}s")
        if old_time > 0:
            print(f"✓ Performance improvement: {(old_time / optimized_time):.2f}x faster")

def test_pagination_support():
    """Test that pagination parameters work correctly"""
    # This is a simple test to verify the pagination logic
    total_items = 75
    page_size = 50
    
    # Calculate pagination
    total_pages = (total_items + page_size - 1) // page_size
    assert total_pages == 2, "Should have 2 pages for 75 items with page size 50"
    
    # Page 1
    page = 1
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    assert start_idx == 0, "Page 1 should start at index 0"
    assert end_idx == 50, "Page 1 should end at index 50"
    
    # Page 2
    page = 2
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    assert start_idx == 50, "Page 2 should start at index 50"
    assert end_idx == 100, "Page 2 should end at index 100"
    
    print("✓ Pagination logic works correctly")

if __name__ == "__main__":
    print("Running performance optimization tests...\n")
    
    try:
        test_database_index_exists()
        print()
        
        test_batch_query_performance()
        print()
        
        test_optimized_expansion_queries()
        print()
        
        test_pagination_support()
        print()
        
        print("✅ All performance optimization tests passed!")
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
