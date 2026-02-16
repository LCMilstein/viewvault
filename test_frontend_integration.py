"""
Minimal integration tests for frontend copy/move components.
Tests that the required JavaScript functions and UI elements exist.
"""
import re
import os

def test_javascript_functions_exist():
    """Test that all required JavaScript functions are defined in app.js"""
    with open('static/app.js', 'r') as f:
        content = f.read()
    
    required_functions = [
        'showListSelector',
        'renderListOptions',
        'selectTargetList',
        'executeCopyOperation',
        'executeMoveOperation',
        'executeBulkCopyOperation',
        'executeBulkMoveOperation',
        'debounceOperation',
        'loadMoreLists',
        'renderListOption'
    ]
    
    for func_name in required_functions:
        # Check for function or const declaration
        pattern = rf'(function\s+{func_name}|const\s+{func_name}\s*=|async\s+function\s+{func_name})'
        if not re.search(pattern, content):
            raise AssertionError(f"Required function '{func_name}' not found in app.js")
    
    print(f"✓ All {len(required_functions)} required JavaScript functions exist")

def test_debounce_implementation():
    """Test that debounce logic is implemented"""
    with open('static/app.js', 'r') as f:
        content = f.read()
    
    # Check for debounce timer variable
    assert 'operationDebounceTimer' in content, "Debounce timer variable should exist"
    
    # Check for debounce delay constant
    assert 'OPERATION_DEBOUNCE_DELAY' in content, "Debounce delay constant should exist"
    
    # Check for debounce function
    assert 'function debounceOperation' in content or 'const debounceOperation' in content, \
        "Debounce function should exist"
    
    print("✓ Debounce implementation exists")

def test_pagination_support():
    """Test that pagination support is implemented"""
    with open('static/app.js', 'r') as f:
        content = f.read()
    
    # Check for pagination parameters in API call
    assert 'page=' in content and 'page_size=' in content, \
        "Pagination parameters should be in API calls"
    
    # Check for loadMoreLists function
    assert 'loadMoreLists' in content, "loadMoreLists function should exist"
    
    # Check for pagination rendering
    assert 'list-selector-pagination' in content, "Pagination UI elements should exist"
    
    print("✓ Pagination support implemented")

def test_lazy_loading_implementation():
    """Test that lazy loading is implemented"""
    with open('static/app.js', 'r') as f:
        content = f.read()
    
    # Check for initial render count
    assert 'INITIAL_RENDER_COUNT' in content, "Initial render count constant should exist"
    
    # Check for requestAnimationFrame (lazy loading)
    assert 'requestAnimationFrame' in content, "Lazy loading with requestAnimationFrame should exist"
    
    print("✓ Lazy loading implementation exists")

def test_html_modal_elements():
    """Test that required HTML modal elements exist"""
    with open('static/index.html', 'r') as f:
        content = f.read()
    
    required_elements = [
        'listSelectorModal',
        'listSelectorTitle',
        'listSelectorSubtitle',
        'listSelectorContent'
    ]
    
    for element_id in required_elements:
        if f'id="{element_id}"' not in content and f"id='{element_id}'" not in content:
            raise AssertionError(f"Required HTML element with id '{element_id}' not found")
    
    print(f"✓ All {len(required_elements)} required HTML elements exist")

def test_css_performance_optimizations():
    """Test that CSS uses transforms for performance"""
    with open('static/index.html', 'r') as f:
        content = f.read()
    
    # Check for transform usage in list-option hover
    assert 'transform:' in content or 'transform :' in content, \
        "CSS transforms should be used for animations"
    
    # Check for pagination CSS
    assert 'list-selector-pagination' in content, "Pagination CSS should exist"
    
    # Check for performance comment
    assert 'PERFORMANCE' in content, "Performance optimization comments should exist"
    
    print("✓ CSS performance optimizations implemented")

def test_api_endpoint_pagination():
    """Test that backend API supports pagination"""
    with open('main.py', 'r') as f:
        content = f.read()
    
    # Check for pagination parameters in available-targets endpoint
    assert 'page: int = Query' in content, "Pagination page parameter should exist"
    assert 'page_size: int = Query' in content, "Pagination page_size parameter should exist"
    
    # Check for pagination response
    assert '"pagination"' in content, "Pagination data should be in response"
    
    print("✓ API pagination support implemented")

def test_batch_operations_optimization():
    """Test that batch operations are optimized"""
    with open('main.py', 'r') as f:
        content = f.read()
    
    # Check for batch fetch comments
    assert 'PERFORMANCE OPTIMIZATION' in content or 'Batch fetch' in content, \
        "Performance optimization comments should exist"
    
    # Check for add_all usage (batch insert)
    assert 'add_all' in content, "Batch insert with add_all should be used"
    
    print("✓ Batch operations optimization implemented")

def test_database_index():
    """Test that database index migration exists"""
    assert os.path.exists('database_performance_migration.py'), \
        "Database performance migration file should exist"
    
    with open('database_performance_migration.py', 'r') as f:
        content = f.read()
    
    # Check for index creation
    assert 'idx_listitem_duplicate_check' in content, "Index name should be in migration"
    assert 'CREATE INDEX' in content, "Index creation SQL should exist"
    
    print("✓ Database index migration exists")

if __name__ == "__main__":
    print("Running frontend integration tests...\n")
    
    try:
        test_javascript_functions_exist()
        test_debounce_implementation()
        test_pagination_support()
        test_lazy_loading_implementation()
        test_html_modal_elements()
        test_css_performance_optimizations()
        test_api_endpoint_pagination()
        test_batch_operations_optimization()
        test_database_index()
        
        print("\n✅ All frontend integration tests passed!")
        print("\nNote: These are minimal structural tests. Full browser-based")
        print("integration tests would require a testing framework like Playwright or Cypress.")
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
