# ViewVault Server - Production Deployment

## Quick Start

### Using Docker Compose (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/LCMilstein/viewvault.git
   cd viewvault
   ```

2. **Set environment variables:**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Deploy with Docker Compose:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Access the application:**
   - URL: `http://your-server:8008`
   - Health check: `http://your-server:8008/health`

### Using Docker Image Directly

1. **Pull the image:**
   ```bash
   docker pull lcmilstein/viewvault-server:latest
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name viewvault-server \
     -p 8008:8000 \
     -e SECRET_KEY=your-secret-key \
     -e JELLYFIN_URL=your-jellyfin-url \
     -e JELLYFIN_API_KEY=your-jellyfin-api-key \
     -e TMDB_API_KEY=your-tmdb-api-key \
     -e IMDB_API_KEY=your-imdb-api-key \
     -v viewvault-server_db:/app/db \
     -v viewvault-server_posters:/app/static/posters \
     --restart unless-stopped \
     lcmilstein/viewvault-server:latest
   ```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `SECRET_KEY` | Secret key for JWT tokens | Yes | `change-me-in-production` |
| `JELLYFIN_URL` | Jellyfin server URL | Yes | - |
| `JELLYFIN_API_KEY` | Jellyfin API key | Yes | - |
| `TMDB_API_KEY` | The Movie Database API key | Yes | - |
| `IMDB_API_KEY` | IMDB API key | Yes | - |
| `DATABASE_URL` | Database connection string | No | `sqlite:///./db/viewvault.db` |

## Building Multi-Architecture Images

To build and push multi-architecture images to Docker Hub:

```bash
./build-docker.sh [version]
```

Example:
```bash
./build-docker.sh v1.0.0
```

This will build for both `linux/amd64` and `linux/arm64` platforms.

## Health Checks

The application includes a health check endpoint:
- **URL:** `/health`
- **Response:** `{"status": "healthy", "service": "viewvault-server"}`

Docker health checks are configured to use this endpoint.

## Volumes

- `viewvault-server_db`: Database storage
- `viewvault-server_posters`: Movie poster images

## Ports

- **8008**: Main application port (mapped from container port 8000)

## Features

- ✅ Unified modal UI for all detail views
- ✅ Jellyfin library import
- ✅ TMDB integration for metadata
- ✅ Multi-user support
- ✅ Watchlist management
- ✅ Collection support
- ✅ Episode tracking
- ✅ Health monitoring
- ✅ Multi-architecture Docker support

## Troubleshooting

### Jellyfin Import Issues

If libraries are missing from the import dialog:
1. Check Jellyfin user permissions
2. Verify API key and server URL
3. Check container logs for authentication errors

### Database Issues

The application uses SQLite by default. For production, consider:
- Regular database backups
- Monitoring disk space
- Database optimization

## Security Notes

- Change the `SECRET_KEY` in production
- Use HTTPS in production
- Restrict CORS origins if needed
- Consider using environment files for sensitive data
