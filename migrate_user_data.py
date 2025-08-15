#!/usr/bin/env python3
"""
Migration script to copy data from default user to a specific user account.
This will copy all movies and series from the default user to the target user.
"""

import sqlite3
import hashlib
import os
import getpass

def hash_password(password: str) -> str:
    """Hash a password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def migrate_user_data(target_username: str, target_password: str):
    """Migrate data from default user to target user"""
    # Get the database path - use the same path as the app
    db_path = os.path.join("db", "watchlist.db")
    
    if not os.path.exists(db_path):
        print(f"Database file {db_path} not found!")
        return
    
    print(f"Starting migration of data to user: {target_username}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if target user exists, create if not
        cursor.execute("SELECT id FROM user WHERE username = ?", (target_username,))
        target_user_result = cursor.fetchone()
        
        if target_user_result:
            target_user_id = target_user_result[0]
            print(f"Found existing user {target_username} with ID: {target_user_id}")
        else:
            # Create target user
            target_password_hash = hash_password(target_password)
            cursor.execute("""
                INSERT INTO user (username, email, hashed_password, is_active, is_admin)
                VALUES (?, ?, ?, ?, ?)
            """, (target_username, f"{target_username}@example.com", target_password_hash, True, False))
            target_user_id = cursor.lastrowid
            print(f"Created new user {target_username} with ID: {target_user_id}")
        
        # Find default user
        cursor.execute("SELECT id FROM user WHERE username = 'default'")
        default_user_result = cursor.fetchone()
        
        if not default_user_result:
            print("No default user found in database")
            return
        
        default_user_id = default_user_result[0]
        print(f"Found default user with ID: {default_user_id}")
        
        # Copy movies from default user to target user
        cursor.execute("""
            INSERT INTO movie (title, imdb_id, release_date, runtime, watched, type, 
                             collection_id, collection_name, poster_url, poster_thumb, 
                             is_new, quality, user_id)
            SELECT title, imdb_id, release_date, runtime, watched, type,
                   collection_id, collection_name, poster_url, poster_thumb,
                   is_new, quality, ?
            FROM movie 
            WHERE user_id = ?
        """, (target_user_id, default_user_id))
        
        movies_copied = cursor.rowcount
        print(f"Copied {movies_copied} movies from default user to {target_username}")
        
        # Copy series from default user to target user
        cursor.execute("""
            INSERT INTO series (title, imdb_id, type, poster_url, poster_thumb,
                              is_new, average_episode_runtime, user_id)
            SELECT title, imdb_id, type, poster_url, poster_thumb,
                   is_new, average_episode_runtime, ?
            FROM series 
            WHERE user_id = ?
        """, (target_user_id, default_user_id))
        
        series_copied = cursor.rowcount
        print(f"Copied {series_copied} series from default user to {target_username}")
        
        # Copy episodes (they're linked to series, so we need to handle the series_id mapping)
        if series_copied > 0:
            # Get the mapping of old series IDs to new series IDs
            cursor.execute("""
                SELECT s1.id as old_id, s2.id as new_id
                FROM series s1
                JOIN series s2 ON s1.imdb_id = s2.imdb_id AND s1.user_id = ? AND s2.user_id = ?
                WHERE s1.user_id = ?
            """, (default_user_id, target_user_id, default_user_id))
            
            series_mapping = {row[0]: row[1] for row in cursor.fetchall()}
            print(f"Series ID mapping: {series_mapping}")
            
            # Copy episodes with updated series_id
            for old_series_id, new_series_id in series_mapping.items():
                cursor.execute("""
                    INSERT INTO episode (series_id, season, episode, title, code, air_date, watched)
                    SELECT ?, season, episode, title, code, air_date, watched
                    FROM episode 
                    WHERE series_id = ?
                """, (new_series_id, old_series_id))
            
            episodes_copied = cursor.rowcount
            print(f"Copied {episodes_copied} episodes from default user to {target_username}")
        
        # Commit changes
        conn.commit()
        print("Migration completed successfully!")
        
        # Verify the migration
        cursor.execute("SELECT COUNT(*) FROM movie WHERE user_id = ?", (target_user_id,))
        target_movies = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM series WHERE user_id = ?", (target_user_id,))
        target_series = cursor.fetchone()[0]
        
        print(f"Verification: {target_username} now has {target_movies} movies and {target_series} series")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    # Prompt for password
    target_username = "LCMilstein"
    target_password = getpass.getpass(f"Enter password for {target_username}: ")
    
    migrate_user_data(target_username, target_password) 