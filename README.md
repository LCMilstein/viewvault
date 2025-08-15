# 🎬 CineSync

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

### Option 1: Docker (Recommended for Synology NAS)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd watchlist-app
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

The application uses SQLite for data storage. The database file (`watchlist.db`) is automatically created on first run and contains:

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
watchlist-app/
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
docker-compose logs watchlist-app

# Restart the service
docker-compose restart watchlist-app
```

---

**Happy watching! 🎬** 