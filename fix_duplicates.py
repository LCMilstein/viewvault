#!/usr/bin/env python3
"""
Simple script to fix duplicate user accounts
"""

from sqlmodel import Session, select
from models import User, List, ListItem, Movie, Series, Episode, ListPermission, LibraryImportHistory
from database import engine

def fix_duplicates():
    email = "lcmilstein@gmail.com"
    
    with Session(engine) as session:
        # Find all users with this email
        users = session.exec(select(User).where(User.email == email)).all()
        
        if len(users) <= 1:
            print(f"Only {len(users)} user found. No fix needed.")
            return
        
        print(f"Found {len(users)} users with email {email}")
        
        # Keep the admin one, or the first one
        primary = next((u for u in users if u.is_admin), users[0])
        others = [u for u in users if u.id != primary.id]
        
        print(f"Keeping user ID {primary.id} as primary")
        
        # Transfer all data from others to primary
        for user in others:
            print(f"Transferring data from user ID {user.id}...")
            
            # Transfer lists and list items
            lists = session.exec(select(List).where(List.user_id == user.id)).all()
            for lst in lists:
                lst.user_id = primary.id
                session.add(lst)
            
            # Transfer movies
            movies = session.exec(select(Movie).where(Movie.user_id == user.id)).all()
            for movie in movies:
                movie.user_id = primary.id
                session.add(movie)
            
            # Transfer series
            series = session.exec(select(Series).where(Series.user_id == user.id)).all()
            for s in series:
                s.user_id = primary.id
                session.add(s)
            
            # Transfer permissions
            perms = session.exec(select(ListPermission).where(ListPermission.shared_with_user_id == user.id)).all()
            for perm in perms:
                perm.shared_with_user_id = primary.id
                session.add(perm)
            
            # Transfer import history
            imports = session.exec(select(LibraryImportHistory).where(LibraryImportHistory.user_id == user.id)).all()
            for imp in imports:
                imp.user_id = primary.id
                session.add(imp)
            
            # Delete the duplicate user
            session.delete(user)
            print(f"Deleted user ID {user.id}")
        
        # Ensure primary user is admin and has correct info
        primary.is_admin = True
        primary.username = email
        primary.email = email
        session.add(primary)
        
        session.commit()
        print(f"✅ Fixed duplicates for {email}")
        print(f"Final user: ID {primary.id}, Email: {primary.email}, Is Admin: {primary.is_admin}")

if __name__ == "__main__":
    fix_duplicates()
