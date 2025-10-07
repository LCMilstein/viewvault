#!/usr/bin/env python3
"""
Database initialization script that runs on app startup
Ensures all tables exist with the correct schema
"""

import os
from sqlmodel import SQLModel, Session, text
from database import engine
from models import User, Movie, Series, Episode, List, ListItem, ListPermission, EmailVerification, LibraryImportHistory

def init_database():
    """Initialize database tables if they don't exist"""
    print("🔧 Initializing database...")
    
    try:
        # Create all tables
        SQLModel.metadata.create_all(engine)
        print("✅ Database tables initialized successfully!")
        
        # Verify tables exist
        with Session(engine) as session:
            result = session.exec(text("SELECT name FROM sqlite_master WHERE type='table'"))
            tables = [row[0] for row in result]
            print(f"📋 Available tables: {', '.join(tables)}")
            
            # Check if user table has the new columns
            result = session.exec(text("PRAGMA table_info(user)"))
            columns = [row[1] for row in result]  # row[1] is the column name
            
            if 'created_at' in columns and 'last_login' in columns:
                print("✅ User table has correct schema with created_at and last_login fields")
            else:
                print("⚠️  User table missing new fields - this may cause issues")
                
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        raise

if __name__ == "__main__":
    init_database()
