#!/usr/bin/env python3
"""
Database migration script to add missing imported_at columns and fix hashed_password constraint.
This ensures all deployments have the correct database schema.
"""

import sqlite3
import os
from pathlib import Path

def run_database_migration():
    """Add missing imported_at columns to existing databases."""
    
    # Get database path from environment or use default
    database_url = os.getenv("DATABASE_URL", "sqlite:///./db/viewvault.db")
    
    # Extract file path from SQLAlchemy URL
    if database_url.startswith("sqlite:///"):
        db_path = database_url.replace("sqlite:///", "")
        if db_path.startswith("./"):
            db_path = db_path[2:]  # Remove ./
    else:
        # Fallback to default path
        db_path = "db/viewvault.db"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"Database file {db_path} does not exist, skipping migration")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if imported_at column exists in movie table
        cursor.execute("PRAGMA table_info(movie)")
        movie_columns = [col[1] for col in cursor.fetchall()]
        
        if "imported_at" not in movie_columns:
            cursor.execute("ALTER TABLE movie ADD COLUMN imported_at DATETIME")
            print("Added imported_at column to movie table")
        else:
            print("imported_at column already exists in movie table")
        
        # Check if imported_at column exists in series table
        cursor.execute("PRAGMA table_info(series)")
        series_columns = [col[1] for col in cursor.fetchall()]
        
        if "imported_at" not in series_columns:
            cursor.execute("ALTER TABLE series ADD COLUMN imported_at DATETIME")
            print("Added imported_at column to series table")
        else:
            print("imported_at column already exists in series table")
        
        conn.commit()
        conn.close()
        print("Database migration completed successfully")
        
    except Exception as e:
        print(f"Database migration failed: {e}")
        raise

def fix_hashed_password_constraint():
    """Fix hashed_password column to allow NULL values for Auth0 users."""
    
    # Get database path from environment or use default
    database_url = os.getenv("DATABASE_URL", "sqlite:///./db/viewvault.db")
    
    # Extract file path from SQLAlchemy URL
    if database_url.startswith("sqlite:///"):
        db_path = database_url.replace("sqlite:///", "")
        if db_path.startswith("./"):
            db_path = db_path[2:]  # Remove ./
    else:
        # Fallback to default path
        db_path = "db/viewvault.db"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"Database file {db_path} does not exist, skipping hashed_password migration")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if user table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user'")
        if not cursor.fetchone():
            print("User table does not exist, skipping hashed_password migration")
            conn.close()
            return
        
        # Check current schema of hashed_password column
        cursor.execute("PRAGMA table_info(user)")
        user_columns = cursor.fetchall()
        
        hashed_password_info = None
        for col in user_columns:
            if col[1] == "hashed_password":
                hashed_password_info = col
                break
        
        if not hashed_password_info:
            print("hashed_password column not found in user table")
            conn.close()
            return
        
        # Check if column allows NULL (col[3] is notnull flag, 0 means allows NULL)
        if hashed_password_info[3] == 1:  # Column is NOT NULL
            print("Fixing hashed_password column to allow NULL values...")
            
            # SQLite doesn't support ALTER COLUMN, so we need to recreate the table
            # First, get all data from the existing table
            cursor.execute("SELECT * FROM user")
            users_data = cursor.fetchall()
            
            # Get column names
            cursor.execute("PRAGMA table_info(user)")
            columns_info = cursor.fetchall()
            column_names = [col[1] for col in columns_info]
            
            # Create new table with correct schema
            cursor.execute("""
                CREATE TABLE user_new (
                    id INTEGER NOT NULL,
                    username VARCHAR NOT NULL,
                    email VARCHAR,
                    full_name VARCHAR,
                    hashed_password VARCHAR,
                    is_active BOOLEAN NOT NULL,
                    is_admin BOOLEAN NOT NULL,
                    auth0_user_id VARCHAR,
                    auth_provider VARCHAR,
                    email_verified BOOLEAN NOT NULL,
                    password_enabled BOOLEAN NOT NULL,
                    oauth_enabled BOOLEAN NOT NULL,
                    PRIMARY KEY (id)
                )
            """)
            
            # Copy data from old table to new table
            if users_data:
                placeholders = ",".join(["?" for _ in column_names])
                cursor.execute(f"INSERT INTO user_new ({','.join(column_names)}) VALUES ({placeholders})", users_data)
            
            # Drop old table and rename new table
            cursor.execute("DROP TABLE user")
            cursor.execute("ALTER TABLE user_new RENAME TO user")
            
            # Recreate indexes
            cursor.execute("CREATE UNIQUE INDEX ix_user_username ON user (username)")
            cursor.execute("CREATE UNIQUE INDEX ix_user_auth0_user_id ON user (auth0_user_id)")
            
            print("Successfully fixed hashed_password column to allow NULL values")
        else:
            print("hashed_password column already allows NULL values")
        
        conn.commit()
        conn.close()
        print("hashed_password migration completed successfully")
        
    except Exception as e:
        print(f"hashed_password migration failed: {e}")
        raise

if __name__ == "__main__":
    run_database_migration()
    fix_hashed_password_constraint()
