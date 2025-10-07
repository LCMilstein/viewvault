from sqlmodel import create_engine
import os

# Get database URL from environment variable, fallback to default
database_url = os.getenv("DATABASE_URL", "sqlite:///./db/viewvault.db")

# Extract file path from SQLAlchemy URL for local file operations
if database_url.startswith("sqlite:///"):
    db_path = database_url.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = db_path[2:]  # Remove ./
    sqlite_file_name = db_path
else:
    # Fallback to default path
    sqlite_file_name = os.path.join("db", "viewvault.db")

sqlite_url = f"sqlite:///{sqlite_file_name}"
engine = create_engine(sqlite_url, echo=True) 