#!/usr/bin/env python3
"""
Script to set a user as admin
Usage: python3 set_admin.py <email_or_username>
"""

import sys
import os
from sqlmodel import Session, select
from models import User
from database import engine

def set_user_admin(email_or_username: str):
    """Set a user as admin by email or username"""
    with Session(engine) as session:
        # Try to find user by email first, then by username
        user = session.exec(select(User).where(User.email == email_or_username)).first()
        if not user:
            user = session.exec(select(User).where(User.username == email_or_username)).first()
        
        if not user:
            print(f"❌ User not found: {email_or_username}")
            print("Available users:")
            all_users = session.exec(select(User)).all()
            for u in all_users:
                print(f"  - Email: {u.email}, Username: {u.username}, Auth Provider: {u.auth_provider}")
            return False
        
        # Set user as admin
        user.is_admin = True
        session.add(user)
        session.commit()
        session.refresh(user)
        
        print(f"✅ Successfully set {user.email} ({user.username}) as admin!")
        return True

def list_users():
    """List all users in the database"""
    with Session(engine) as session:
        users = session.exec(select(User)).all()
        if not users:
            print("No users found in database.")
            return
        
        print("Current users:")
        for user in users:
            admin_status = "👑 ADMIN" if user.is_admin else "👤 User"
            print(f"  {admin_status} - Email: {user.email}, Username: {user.username}, Auth Provider: {user.auth_provider}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 set_admin.py <email_or_username>")
        print("       python3 set_admin.py --list (to list all users)")
        sys.exit(1)
    
    if sys.argv[1] == "--list":
        list_users()
    else:
        email_or_username = sys.argv[1]
        set_user_admin(email_or_username)
