#!/usr/bin/env python3
"""
Migration script to add overview field to Movie table.
This script safely adds the overview column to existing Movie records.
"""

import sqlite3
import sys
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_add_overview():
    """Add overview column to Movie table."""
    db_path = Path("db/watchlist.db")
    
    if not db_path.exists():
        logger.error(f"Database file not found: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if overview column already exists
        cursor.execute("PRAGMA table_info(movie)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'overview' in columns:
            logger.info("Overview column already exists. Migration not needed.")
            conn.close()
            return True
        
        # Add overview column
        logger.info("Adding overview column to movie table...")
        cursor.execute("ALTER TABLE movie ADD COLUMN overview TEXT")
        
        # Commit changes
        conn.commit()
        logger.info("Successfully added overview column to movie table.")
        
        # Verify the column was added
        cursor.execute("PRAGMA table_info(movie)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'overview' in columns:
            logger.info("✅ Migration completed successfully!")
        else:
            logger.error("❌ Migration failed - overview column not found after addition")
            return False
            
        conn.close()
        return True
        
    except sqlite3.Error as e:
        logger.error(f"Database error during migration: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during migration: {e}")
        return False

if __name__ == "__main__":
    logger.info("Starting migration to add overview field to Movie table...")
    success = migrate_add_overview()
    
    if success:
        logger.info("Migration completed successfully! 🎉")
        sys.exit(0)
    else:
        logger.error("Migration failed! ❌")
        sys.exit(1)
