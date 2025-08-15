from sqlmodel import create_engine
import os

sqlite_file_name = os.path.join("db", "watchlist.db")
sqlite_url = f"sqlite:///{sqlite_file_name}"

engine = create_engine(sqlite_url, echo=True) 