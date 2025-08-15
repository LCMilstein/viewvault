#!/usr/bin/env python3
"""Check what movies exist in the database"""

from database import engine
from sqlmodel import Session, select
from models import Movie

def check_movies():
    with Session(engine) as session:
        # Check total movies
        all_movies = session.exec(select(Movie)).all()
        print(f'Total movies in database: {len(all_movies)}')
        
        if all_movies:
            print('\nSample movies:')
            for movie in all_movies[:10]:
                print(f'  {movie.id}: {movie.title} (user_id: {movie.user_id})')
        
        # Check for Superman movies specifically
        superman_movies = session.exec(select(Movie).where(Movie.title.like('%Superman%'))).all()
        print(f'\nSuperman movies found: {len(superman_movies)}')
        for movie in superman_movies:
            print(f'  {movie.id}: {movie.title} (user_id: {movie.user_id})')

if __name__ == "__main__":
    check_movies() 