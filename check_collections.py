#!/usr/bin/env python3
"""Check collections and their contents"""

from database import engine
from sqlmodel import Session, select
from models import Movie

def check_collections():
    with Session(engine) as session:
        # Get all movies with their collection info
        all_movies = session.exec(select(Movie)).all()
        print(f'Total movies in database: {len(all_movies)}')
        
        print('\nAll movies with collection info:')
        for movie in all_movies:
            print(f'  {movie.id}: {movie.title}')
            print(f'    Collection ID: {movie.collection_id}')
            print(f'    Collection Name: {movie.collection_name}')
            print(f'    IMDB ID: {movie.imdb_id}')
            print(f'    User ID: {movie.user_id}')
            print()
        
        # Check for distinct collection names
        collections = session.exec(select(Movie.collection_name).distinct().where(Movie.collection_name.is_not(None))).all()
        print(f'Distinct collection names: {len(collections)}')
        for col in collections:
            if col[0]:
                print(f'  "{col[0]}"')
        
        # Check for distinct collection IDs
        collection_ids = session.exec(select(Movie.collection_id).distinct().where(Movie.collection_id.is_not(None))).all()
        print(f'\nDistinct collection IDs: {len(collection_ids)}')
        for col_id in collection_ids:
            if col_id[0]:
                print(f'  {col_id[0]}')

if __name__ == "__main__":
    check_collections() 