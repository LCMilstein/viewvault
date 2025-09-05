# ViewVault - Portainer Deployment Guide

## Quick Deployment Steps

### 1. **Create New Stack in Portainer**

1. Go to **Stacks** → **Add stack**
2. Name: `viewvault-server`
3. Build method: **Repository**
4. Repository URL: `https://github.com/LCMilstein/viewvault.git`
5. Reference: `refs/heads/main`
6. Compose path: `portainer-stack.yml`

### 2. **Set Environment Variables**

In the **Environment variables** section, add:

| Variable | Value | Description |
|----------|-------|-------------|
| `SECRET_KEY` | `your-super-secret-key-here` | JWT secret key (change this!) |
| `JELLYFIN_URL` | `http://192.168.1.211:8096` | Your Jellyfin server URL |
| `JELLYFIN_API_KEY` | `your-jellyfin-api-key` | Jellyfin API key |
| `TMDB_API_KEY` | `your-tmdb-api-key` | The Movie Database API key |
| `IMDB_API_KEY` | `your-imdb-api-key` | IMDB API key |

### 3. **Deploy the Stack**

1. Click **Deploy the stack**
2. Wait for the container to start
3. Check logs if needed

### 4. **Access the Application**

- **URL:** `http://192.168.1.211:8008`
- **Health Check:** `http://192.168.1.211:8008/health`

## Alternative: Use Pre-built Image

If you prefer to use the pre-built image directly:

1. Go to **Stacks** → **Add stack**
2. Name: `viewvault-server`
3. Build method: **Repository**
4. Repository URL: `https://github.com/LCMilstein/viewvault.git`
5. Reference: `refs/heads/main`
6. Compose path: `docker-compose.prod.yml`

## Environment Variables Reference

### Required Variables:
- `SECRET_KEY` - Secret key for JWT tokens
- `JELLYFIN_URL` - Jellyfin server URL
- `JELLYFIN_API_KEY` - Jellyfin API key
- `TMDB_API_KEY` - The Movie Database API key
- `IMDB_API_KEY` - IMDB API key

### Optional Variables:
- `DATABASE_URL` - Database connection string (default: `sqlite:///./db/viewvault.db`)

## Troubleshooting

### Container Won't Start
1. Check the logs in Portainer
2. Verify all environment variables are set
3. Check if port 8008 is available

### Jellyfin Import Issues
1. Verify `JELLYFIN_URL` and `JELLYFIN_API_KEY` are correct
2. Check Jellyfin user permissions
3. Look at container logs for authentication errors

### Health Check Failing
1. Wait a few minutes for the container to fully start
2. Check if the application is responding on port 8000 inside the container
3. Verify the health check endpoint: `http://container-ip:8000/health`

## Features Included

- ✅ Unified modal UI for all detail views
- ✅ Jellyfin library import
- ✅ TMDB integration for metadata
- ✅ Multi-user support
- ✅ Watchlist management
- ✅ Collection support
- ✅ Episode tracking
- ✅ Health monitoring
- ✅ Multi-architecture Docker support

## Updating the Application

To update to the latest version:

1. Go to **Stacks** → **viewvault-server**
2. Click **Editor**
3. Click **Pull and redeploy**
4. This will pull the latest `lcmilstein/viewvault:latest` image
