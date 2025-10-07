#!/usr/bin/env python3
"""
Script to create all database tables from scratch
"""

from sqlmodel import SQLModel
from database import engine
from models import User, Movie, Series, Episode, List, ListItem, ListPermission, EmailVerification, LibraryImportHistory

def create_tables():
    """Create all database tables"""
    print("Creating database tables...")
    
    # Create all tables
    SQLModel.metadata.create_all(engine)
    
    print("✅ All tables created successfully!")
    
    # Verify tables were created
    from sqlmodel import Session, text
    with Session(engine) as session:
        result = session.exec(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = [row[0] for row in result]
        print(f"Created tables: {', '.join(tables)}")

if __name__ == "__main__":
    create_tables()
