#!/usr/bin/env python3
"""
Fix missing list items - ensure existing movies are properly linked to lists
"""

import os
import sqlite3
from pathlib import Path
from datetime import datetime

def fix_list_items():
    """Fix movies that exist but aren't linked to any lists"""
    
    # Try both possible database locations
    db_paths = ["db/watchlist.db", "watchlist.db"]
    db_path = None
    
    for path in db_paths:
        if os.path.exists(path):
            db_path = path
            break
    
    if not db_path:
        print("❌ Database file not found!")
        return False
    
    print(f"📂 Using database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if list tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='list'")
        if not cursor.fetchone():
            print("❌ List tables don't exist. Run migrate_lists.py first!")
            return False
        
        print("\n=== CURRENT DATABASE STATE ===")
        
        # Show all movies
        cursor.execute("SELECT id, title, imdb_id, user_id FROM movie WHERE user_id = 1")
        movies = cursor.fetchall()
        print(f"📽️ Movies for user 1: {len(movies)}")
        for movie in movies:
            print(f"  - ID {movie[0]}: {movie[1]} (IMDB: {movie[2]})")
        
        # Show all lists
        cursor.execute("SELECT id, name, user_id, type FROM list WHERE user_id = 1")
        lists = cursor.fetchall()
        print(f"\n📋 Lists for user 1: {len(lists)}")
        for lst in lists:
            print(f"  - ID {lst[0]}: {lst[1]} (Type: {lst[3]})")
        
        # Show list items
        cursor.execute("""
            SELECT li.list_id, l.name, li.item_type, li.item_id, m.title 
            FROM listitem li 
            JOIN list l ON li.list_id = l.id 
            LEFT JOIN movie m ON li.item_id = m.id AND li.item_type = 'movie'
            WHERE l.user_id = 1
        """)
        list_items = cursor.fetchall()
        print(f"\n🔗 List items: {len(list_items)}")
        for item in list_items:
            print(f"  - List '{item[1]}' contains {item[2]} ID {item[3]}: {item[4] or 'Unknown'}")
        
        # Find movies not in any lists
        cursor.execute("""
            SELECT m.id, m.title, m.imdb_id 
            FROM movie m 
            LEFT JOIN listitem li ON m.id = li.item_id AND li.item_type = 'movie'
            WHERE m.user_id = 1 AND li.id IS NULL
        """)
        orphaned_movies = cursor.fetchall()
        
        if orphaned_movies:
            print(f"\n⚠️  Found {len(orphaned_movies)} movies not in any lists:")
            for movie in orphaned_movies:
                print(f"  - ID {movie[0]}: {movie[1]} (IMDB: {movie[2]})")
            
            # Check if Big Buck Bunny is among them
            big_buck = [m for m in orphaned_movies if m[2] == 'tt1254207']
            if big_buck:
                print(f"\n🎯 Found Big Buck Bunny: {big_buck[0]}")
                
                # Find Family Flicks list
                cursor.execute("SELECT id, name FROM list WHERE user_id = 1 AND name LIKE '%Family%'")
                family_list = cursor.fetchone()
                
                if family_list:
                    print(f"📋 Found Family Flicks list: ID {family_list[0]} - {family_list[1]}")
                    
                    # Add Big Buck Bunny to Family Flicks
                    cursor.execute("""
                        INSERT INTO listitem (list_id, item_type, item_id, added_at, watched, deleted)
                        VALUES (?, 'movie', ?, ?, 0, 0)
                    """, (family_list[0], big_buck[0][0], datetime.now().isoformat()))
                    
                    print("✅ Added Big Buck Bunny to Family Flicks list!")
                    conn.commit()
                else:
                    print("❌ No Family Flicks list found")
            else:
                print("ℹ️  Big Buck Bunny not found in orphaned movies")
        else:
            print("\n✅ All movies are properly linked to lists")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    print("🔧 Fix List Items Script")
    print("=" * 50)
    fix_list_items()
