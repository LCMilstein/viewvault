"""
Performance optimization migration for list copy/move feature.
Adds database indexes to improve duplicate check performance.
"""
import logging
from sqlmodel import Session, text
from database import engine

logger = logging.getLogger(__name__)

def add_list_item_performance_indexes():
    """Add composite index on ListItem table for faster duplicate checks"""
    try:
        with Session(engine) as session:
            # Check if index already exists
            result = session.execute(text("""
                SELECT name FROM sqlite_master 
                WHERE type='index' AND name='idx_listitem_duplicate_check'
            """))
            
            if result.fetchone():
                logger.info("Index idx_listitem_duplicate_check already exists")
                return
            
            # Create composite index for duplicate checks
            # This index covers the most common query pattern: (list_id, item_id, item_type, deleted)
            logger.info("Creating composite index idx_listitem_duplicate_check...")
            session.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_listitem_duplicate_check 
                ON listitem(list_id, item_id, item_type, deleted)
            """))
            
            session.commit()
            logger.info("Successfully created index idx_listitem_duplicate_check")
            
            # Verify index was created
            result = session.execute(text("""
                SELECT name FROM sqlite_master 
                WHERE type='index' AND name='idx_listitem_duplicate_check'
            """))
            
            if result.fetchone():
                logger.info("Index verification successful")
            else:
                logger.warning("Index creation may have failed - verification returned no results")
                
    except Exception as e:
        logger.error(f"Error creating performance indexes: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")

def run_performance_migration():
    """Run all performance optimizations"""
    logger.info("Starting performance optimization migration...")
    add_list_item_performance_indexes()
    logger.info("Performance optimization migration completed")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_performance_migration()
