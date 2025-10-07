# 🎬 ViewVault

A comprehensive media tracking application that helps you keep track of movies and TV shows you want to watch and have already watched. Perfect for maintaining your personal "canonical source of truth" for media consumption.

## ✨ Features

- **Movie & TV Series Management**: Add, track, and manage your watchlist
- **IMDB Integration**: Search and import movies/series directly from IMDB
- **Episode Tracking**: Automatic episode import for TV series with season/episode tracking
- **Watched Status**: Mark movies and episodes as watched/unwatched
- **Web Interface**: Beautiful, responsive web UI accessible from any device
- **Statistics**: Track your viewing progress and statistics
- **Docker Support**: Easy deployment on Synology NAS or any Docker environment
- **RESTful API**: Full API for potential mobile app integration

## 🚀 Quick Start

### Option 1: Deploy From Git (Recommended for Synology NAS / Portainer)

1. In Portainer, create a new Stack → From git repository.
2. Repository: your GitHub repo; Branch: `main`.
3. Compose path: `viewvault-backend/docker-compose.yml`.
4. Environment/Secrets: create a file on your NAS (e.g., `/volume1/docker/viewvault-backend/secrets.env`) from `secrets.env.example` and bind it in the stack (see compose `env_file` or a bind mount).
5. Deploy. Named volumes for DB/posters will be created automatically.

The stack builds directly from Git; no local files are required on the NAS besides your `secrets.env`.

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd viewvault-backend
   ```

2. **Set up environment** (optional):
   ```bash
   # Create .env file for IMDB API key (optional)
   echo "IMDB_API_KEY=your_api_key_here" > .env
   ```

3. **Run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - Web UI: http://your-nas-ip:8000
   - API: http://your-nas-ip:8000/api/

### Option 2: Local Development

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the application**:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Access the application**:
   - Web UI: http://localhost:8000
   - API: http://localhost:8000/api/

## 🔧 Configuration

### Secrets and Environment

Copy `secrets.env.example` to `secrets.env` and set values:

```
SECRET_KEY=change-me
TMDB_API_KEY=your_tmdb_key
IMDB_API_KEY=your_omdb_key
JELLYFIN_URL=http://192.168.1.211:8096
JELLYFIN_API_KEY=your_jellyfin_api_key
JELLYFIN_USER_ID=your_jellyfin_user_id
```

Mount this file on the NAS as `/app/secrets.env` (or use `env_file: ./secrets.env` if building locally).

### IMDB API Key (Optional)

For full IMDB integration, get a free API key from [OMDB API](http://www.omdbapi.com/):

1. Visit http://www.omdbapi.com/
2. Request a free API key
3. Set the environment variable:
   ```bash
   export IMDB_API_KEY=your_api_key_here
   ```
   Or add it to your `.env` file for Docker deployment.

**Note**: The app works without an API key using mock data for development.

## 📱 Usage

### Web Interface

1. **Search & Import**:
   - Enter a movie or TV show title in the search box
   - Click "Search Movies" or "Search Series"
   - Click "Import" to add to your watchlist

2. **Manage Watchlist**:
   - View all your movies and series
   - Mark items as watched/unwatched
   - Track episode progress for TV series

3. **Statistics**:
   - View your viewing statistics
   - Track progress across different media types

### API Endpoints

#### Search & Import
- `GET /search/movies/?query={title}` - Search for movies
- `GET /search/series/?query={title}` - Search for TV series
- `POST /import/movie/{imdb_id}` - Import a movie
- `POST /import/series/{imdb_id}` - Import a series with episodes

#### Movies
- `GET /movies/` - Get all movies
- `POST /movies/` - Add a movie
- `GET /movies/{id}` - Get specific movie
- `PUT /movies/{id}` - Update movie
- `DELETE /movies/{id}` - Delete movie
- `PATCH /movies/{id}/watched` - Toggle watched status

#### Series
- `GET /series/` - Get all series
- `POST /series/` - Add a series
- `GET /series/{id}` - Get specific series
- `PUT /series/{id}` - Update series
- `DELETE /series/{id}` - Delete series

#### Episodes
- `GET /episodes/?series_id={id}` - Get episodes for a series
- `POST /episodes/` - Add an episode
- `GET /episodes/{id}` - Get specific episode
- `PUT /episodes/{id}` - Update episode
- `DELETE /episodes/{id}` - Delete episode
- `PATCH /episodes/{id}/watched` - Toggle watched status

#### Statistics
- `GET /stats/` - Get viewing statistics

## 🗄️ Database

The application uses SQLite for data storage. The database file (`viewvault.db`) is automatically created on first run and contains:

- **Movies**: Movie information and watched status
- **Series**: TV series information
- **Episodes**: Episode details with season/episode tracking

## 🔄 Future Features

- [ ] **Scheduled Updates**: Automatic checking for new episodes
- [ ] **Mobile App**: Native mobile application
- [ ] **Notifications**: Alerts for new episodes/seasons
- [ ] **Export/Import**: Backup and restore functionality
- [ ] **Multiple Users**: User authentication and profiles
- [ ] **Advanced Filtering**: Filter by genre, year, rating, etc.
- [ ] **Recommendations**: AI-powered content recommendations

## 🛠️ Development

### Project Structure
```
viewvault-backend/
├── main.py              # FastAPI application
├── models.py            # Database models
├── imdb_service.py      # IMDB integration
├── static/
│   └── index.html       # Web frontend
├── requirements.txt     # Python dependencies
├── Dockerfile          # Docker configuration
├── docker-compose.yml  # Docker Compose setup
└── README.md           # This file
```

### Adding New Features

1. **Database Models**: Add new models in `models.py`
2. **API Endpoints**: Add endpoints in `main.py`
3. **Frontend**: Update `static/index.html`
4. **Services**: Add new services in separate files

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🆘 Support

If you encounter any issues:

1. Check the application logs
2. Verify your IMDB API key (if using)
3. Ensure the database file is writable
4. Check Docker container health status

For Docker deployments:
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs viewvault-backend

# Restart the service
docker-compose restart viewvault-backend
```

---

**Happy watching! 🎬** 