#!/usr/bin/env python3
"""
Database migration script to add list management tables.
This script adds the List, ListItem, and ListPermission tables to the existing database.
"""

import os
import sys
from sqlmodel import SQLModel, create_engine, Session, text
from models import List, ListItem, ListPermission

def migrate_database():
    """Add list management tables to the database"""
    
    # Database path
    db_path = "watchlist.db"
    
    # Check if database exists
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        print("Please run the main application first to create the database.")
        return False
    
    try:
        # Create engine
        engine = create_engine(f"sqlite:///{db_path}")
        
        # Create new tables
        print("Creating list management tables...")
        SQLModel.metadata.create_all(engine, tables=[List.__table__, ListItem.__table__, ListPermission.__table__])
        
        print("✅ List management tables created successfully!")
        
        # Verify tables exist
        with Session(engine) as session:
            # Check if tables exist by trying to query them
            try:
                result = session.exec(text("SELECT COUNT(*) FROM list"))
                list_count = result.first()[0]
                print(f"✅ List table verified: {list_count} rows")
            except Exception as e:
                print(f"❌ List table verification failed: {e}")
                return False
            
            try:
                result = session.exec(text("SELECT COUNT(*) FROM listitem"))
                list_item_count = result.first()[0]
                print(f"✅ ListItem table verified: {list_item_count} rows")
            except Exception as e:
                print(f"❌ ListItem table verification failed: {e}")
                return False
            
            try:
                result = session.exec(text("SELECT COUNT(*) FROM listpermission"))
                list_permission_count = result.first()[0]
                print(f"✅ ListPermission table verified: {list_permission_count} rows")
            except Exception as e:
                print(f"❌ ListPermission table verification failed: {e}")
                return False
        
        print("\n🎉 Database migration completed successfully!")
        print("The list management system is now ready to use.")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting list management database migration...")
    print("=" * 50)
    
    success = migrate_database()
    
    if success:
        print("\n✅ Migration completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Migration failed!")
        sys.exit(1)
