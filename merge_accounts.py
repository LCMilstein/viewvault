#!/usr/bin/env python3
"""
Script to merge duplicate user accounts by email
Usage: python3 merge_accounts.py <email>
"""

import sys
from sqlmodel import Session, select
from models import User, List, ListItem, Movie, Series, Episode, ListPermission, LibraryImportHistory
from database import engine

def merge_user_accounts(email: str):
    """Merge all user accounts with the same email into one"""
    with Session(engine) as session:
        # Find all users with this email
        users = session.exec(select(User).where(User.email == email)).all()
        
        if len(users) <= 1:
            print(f"Only {len(users)} user found with email {email}. No merging needed.")
            return
        
        print(f"Found {len(users)} users with email {email}:")
        for i, user in enumerate(users):
            print(f"  {i+1}. ID: {user.id}, Username: {user.username}, Auth Provider: {user.auth_provider}, Is Admin: {user.is_admin}")
        
        # Choose the primary account (prioritize admin, then auth0, then first created)
        primary_user = None
        for user in users:
            if user.is_admin:
                primary_user = user
                break
        
        if not primary_user:
            for user in users:
                if user.auth_provider == 'auth0':
                    primary_user = user
                    break
        
        if not primary_user:
            primary_user = users[0]  # First user
        
        print(f"\nUsing user ID {primary_user.id} ({primary_user.username}) as primary account")
        
        # Merge data from other accounts
        for user in users:
            if user.id == primary_user.id:
                continue
                
            print(f"\nMerging data from user ID {user.id}...")
            
            # Merge lists (rename if there are conflicts)
            lists = session.exec(select(List).where(List.user_id == user.id)).all()
            for list_obj in lists:
                # Check if primary user has a list with the same name
                existing_list = session.exec(select(List).where(
                    List.user_id == primary_user.id,
                    List.name == list_obj.name
                )).first()
                
                if existing_list:
                    # Merge list items into existing list
                    list_items = session.exec(select(ListItem).where(ListItem.list_id == list_obj.id)).all()
                    for item in list_items:
                        item.list_id = existing_list.id
                        session.add(item)
                    print(f"  Merged {len(list_items)} items from list '{list_obj.name}' into existing list")
                    # Delete the duplicate list
                    session.delete(list_obj)
                else:
                    # Transfer the list to primary user
                    list_obj.user_id = primary_user.id
                    session.add(list_obj)
                    print(f"  Transferred list '{list_obj.name}' to primary user")
            
            # Merge movies
            movies = session.exec(select(Movie).where(Movie.user_id == user.id)).all()
            for movie in movies:
                movie.user_id = primary_user.id
                session.add(movie)
            print(f"  Transferred {len(movies)} movies to primary user")
            
            # Merge series
            series = session.exec(select(Series).where(Series.user_id == user.id)).all()
            for s in series:
                s.user_id = primary_user.id
                session.add(s)
            print(f"  Transferred {len(series)} series to primary user")
            
            # Merge episodes (through series, but also check for orphaned episodes)
            episodes = session.exec(select(Episode).join(Series).where(Series.user_id == user.id)).all()
            for episode in episodes:
                session.add(episode)  # Episodes are updated through series
            print(f"  Transferred {len(episodes)} episodes to primary user")
            
            # Merge list permissions (where user is shared with)
            permissions = session.exec(select(ListPermission).where(ListPermission.shared_with_user_id == user.id)).all()
            for perm in permissions:
                perm.shared_with_user_id = primary_user.id
                session.add(perm)
            print(f"  Updated {len(permissions)} list permissions")
            
            # Merge library import history
            import_history = session.exec(select(LibraryImportHistory).where(LibraryImportHistory.user_id == user.id)).all()
            for history in import_history:
                history.user_id = primary_user.id
                session.add(history)
            print(f"  Transferred {len(import_history)} import history records")
            
            # Delete the duplicate user
            session.delete(user)
            print(f"  Deleted duplicate user ID {user.id}")
        
        # Update primary user to have the best attributes
        primary_user.email = email
        primary_user.username = email  # Use email as username for consistency
        
        # If any of the merged users had auth0, preserve that
        for user in users:
            if user.auth_provider == 'auth0' and user.auth0_user_id:
                primary_user.auth_provider = 'auth0'
                primary_user.auth0_user_id = user.auth0_user_id
                break
        
        session.add(primary_user)
        session.commit()
        session.refresh(primary_user)
        
        print(f"\n✅ Successfully merged all accounts for {email}")
        print(f"Final user: ID {primary_user.id}, Username: {primary_user.username}, Auth Provider: {primary_user.auth_provider}, Is Admin: {primary_user.is_admin}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 merge_accounts.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    merge_user_accounts(email)
