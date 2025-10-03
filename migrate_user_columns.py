#!/usr/bin/env python3
"""
Database migration script to add new user columns for multi-auth support
"""

import sqlite3
import os
import sys

def migrate_database():
    """Add new columns to the user table for multi-auth support"""
    
    # Get database path
    db_path = 'viewvault.db'
    if not os.path.exists(db_path):
        print(f"❌ Database not found at {db_path}")
        return False
    
    print(f"🔧 Migrating database at {db_path}")
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(user)")
        columns = [row[1] for row in cursor.fetchall()]
        
        print(f"📋 Current user table columns: {columns}")
        
        # Add new columns if they don't exist
        new_columns = [
            ('email_verified', 'BOOLEAN DEFAULT FALSE'),
            ('password_enabled', 'BOOLEAN DEFAULT TRUE'),
            ('oauth_enabled', 'BOOLEAN DEFAULT FALSE')
        ]
        
        for column_name, column_def in new_columns:
            if column_name not in columns:
                print(f"➕ Adding column: {column_name}")
                cursor.execute(f"ALTER TABLE user ADD COLUMN {column_name} {column_def}")
            else:
                print(f"✅ Column {column_name} already exists")
        
        # Update existing users based on their auth_provider
        print("🔄 Updating existing user records...")
        
        # Get all users
        cursor.execute("SELECT id, auth_provider FROM user")
        users = cursor.fetchall()
        
        for user_id, auth_provider in users:
            if auth_provider == 'auth0':
                # Auth0 users should have email_verified=True, password_enabled=False, oauth_enabled=True
                cursor.execute("""
                    UPDATE user 
                    SET email_verified = TRUE, 
                        password_enabled = FALSE, 
                        oauth_enabled = TRUE 
                    WHERE id = ?
                """, (user_id,))
                print(f"  📝 Updated Auth0 user {user_id}")
            elif auth_provider == 'local':
                # Local users should have email_verified=False (for now), password_enabled=True, oauth_enabled=False
                cursor.execute("""
                    UPDATE user 
                    SET email_verified = FALSE, 
                        password_enabled = TRUE, 
                        oauth_enabled = FALSE 
                    WHERE id = ?
                """, (user_id,))
                print(f"  📝 Updated local user {user_id}")
            else:
                # Default values for any other cases
                cursor.execute("""
                    UPDATE user 
                    SET email_verified = FALSE, 
                        password_enabled = TRUE, 
                        oauth_enabled = FALSE 
                    WHERE id = ?
                """, (user_id,))
                print(f"  📝 Updated user {user_id} with default values")
        
        # Commit changes
        conn.commit()
        
        # Verify the migration
        cursor.execute("PRAGMA table_info(user)")
        final_columns = [row[1] for row in cursor.fetchall()]
        print(f"✅ Final user table columns: {final_columns}")
        
        conn.close()
        print("🎉 Database migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False

if __name__ == "__main__":
    success = migrate_database()
    sys.exit(0 if success else 1)
