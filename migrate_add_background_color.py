#!/usr/bin/env python3
"""
Migration script to add background_color field to existing lists.
This adds a background_color column to the list table for storing list page background colors.
"""

import sqlite3
import os
from datetime import datetime

def migrate_background_color():
    """Add background_color field to existing lists"""
    
    # Database path
    db_path = "watchlist.db"
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found!")
        return False
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("Starting background_color migration...")
        
        # Check if background_color column already exists
        cursor.execute("PRAGMA table_info(list)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'background_color' in columns:
            print("background_color column already exists, skipping migration.")
            return True
        
        # Add background_color column
        print("Adding background_color column to list table...")
        cursor.execute("ALTER TABLE list ADD COLUMN background_color TEXT")
        
        # Set default background colors for existing lists
        print("Setting default background colors for existing lists...")
        
        # Update personal lists to have a default dark blue background
        cursor.execute("""
            UPDATE list 
            SET background_color = '#1a1a2e' 
            WHERE type = 'personal'
        """)
        
        # Update custom lists to have varied default backgrounds
        cursor.execute("""
            UPDATE list 
            SET background_color = CASE 
                WHEN color = '#FF3B30' THEN '#4d1b1b'  -- Red chip -> Dark red background
                WHEN color = '#34C759' THEN '#1b4d3e'  -- Green chip -> Dark green background
                WHEN color = '#FF9500' THEN '#4d3b1b'  -- Orange chip -> Dark brown background
                WHEN color = '#AF52DE' THEN '#3b1b4d'  -- Purple chip -> Dark purple background
                WHEN color = '#FF2D92' THEN '#4d1b3b'  -- Pink chip -> Dark pink background
                WHEN color = '#5AC8FA' THEN '#1b3b4d'  -- Light blue chip -> Dark blue background
                WHEN color = '#FFCC02' THEN '#4d4d1b'  -- Yellow chip -> Dark yellow background
                ELSE '#2d1b69'  -- Default dark purple for other colors
            END
            WHERE type = 'custom' AND background_color IS NULL
        """)
        
        # Commit changes
        conn.commit()
        
        # Verify the migration
        cursor.execute("PRAGMA table_info(list)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'background_color' in columns:
            print("✅ background_color column successfully added!")
            
            # Show some sample data
            cursor.execute("SELECT name, color, background_color FROM list LIMIT 5")
            sample_data = cursor.fetchall()
            print("\nSample data after migration:")
            for name, color, bg_color in sample_data:
                print(f"  {name}: chip={color}, background={bg_color}")
            
            return True
        else:
            print("❌ Failed to add background_color column!")
            return False
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        return False
        
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 50)
    print("CineSync Database Migration: Add Background Color")
    print("=" * 50)
    print(f"Started at: {datetime.now()}")
    print()
    
    success = migrate_background_color()
    
    print()
    if success:
        print("✅ Migration completed successfully!")
    else:
        print("❌ Migration failed!")
    
    print("=" * 50)
