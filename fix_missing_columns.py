#!/usr/bin/env python3
"""
Emergency migration script to fix missing database columns.
This script adds missing columns that exist in the model but not in the database.
"""

import sqlite3
import sys
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_missing_columns():
    """Add missing columns to tables."""
    db_path = Path("db/watchlist.db")
    
    if not db_path.exists():
        logger.error(f"Database file not found: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check current movie table columns
        cursor.execute("PRAGMA table_info(movie)")
        movie_columns = [column[1] for column in cursor.fetchall()]
        logger.info(f"Current movie columns: {movie_columns}")
        
        # Check if list table exists and get its columns
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='list'")
        list_table_exists = cursor.fetchone() is not None
        
        if list_table_exists:
            cursor.execute("PRAGMA table_info(list)")
            list_columns = [column[1] for column in cursor.fetchall()]
            logger.info(f"Current list columns: {list_columns}")
        else:
            logger.info("List table does not exist yet - skipping list column checks")
            list_columns = []
        
        changes_made = False
        
        # Add overview column to movie table if missing
        if 'overview' not in movie_columns:
            logger.info("Adding overview column to movie table...")
            cursor.execute("ALTER TABLE movie ADD COLUMN overview TEXT")
            changes_made = True
            logger.info("✅ Added overview column to movie table")
        else:
            logger.info("✅ overview column already exists in movie table")
        
        # Add background_color column to list table if missing
        if list_table_exists and 'background_color' not in list_columns:
            logger.info("Adding background_color column to list table...")
            cursor.execute("ALTER TABLE list ADD COLUMN background_color TEXT")
            changes_made = True
            logger.info("✅ Added background_color column to list table")
        elif list_table_exists:
            logger.info("✅ background_color column already exists in list table")
        else:
            logger.info("ℹ️ List table doesn't exist - will be created with background_color column when first used")
        
        if changes_made:
            # Commit changes
            conn.commit()
            logger.info("💾 Database changes committed successfully")
            
            # Verify the columns were added
            cursor.execute("PRAGMA table_info(movie)")
            final_movie_columns = [column[1] for column in cursor.fetchall()]
            
            logger.info(f"Final movie columns: {final_movie_columns}")
            
            if list_table_exists:
                cursor.execute("PRAGMA table_info(list)")
                final_list_columns = [column[1] for column in cursor.fetchall()]
                logger.info(f"Final list columns: {final_list_columns}")
                
                # Verify required columns exist
                if 'overview' in final_movie_columns and 'background_color' in final_list_columns:
                    logger.info("🎉 All required columns successfully added!")
                    return True
                else:
                    logger.error("❌ Some columns still missing after migration")
                    return False
            else:
                # Only verify movie overview column if list table doesn't exist
                if 'overview' in final_movie_columns:
                    logger.info("🎉 Movie overview column successfully added!")
                    return True
                else:
                    logger.error("❌ Movie overview column still missing after migration")
                    return False
        else:
            logger.info("✅ No changes needed - all columns already exist")
            return True
            
        conn.close()
        
    except sqlite3.Error as e:
        logger.error(f"Database error during migration: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during migration: {e}")
        return False

if __name__ == "__main__":
    logger.info("🔧 Starting emergency migration to fix missing columns...")
    success = fix_missing_columns()
    
    if success:
        logger.info("✅ Migration completed successfully! 🎉")
        logger.info("🚀 You can now redeploy the application")
        sys.exit(0)
    else:
        logger.error("❌ Migration failed!")
        sys.exit(1)
