# iOS Client API Analysis

## Current API Endpoints (103 total)

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login  
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/make-admin` - Make user admin
- `DELETE /api/auth/delete-current-user` - Delete current user

### Core Data Endpoints
- `GET /api/movies/` - List movies
- `POST /api/movies/` - Create movie
- `GET /api/movies/{movie_id}` - Get movie details
- `PUT /api/movies/{movie_id}` - Update movie
- `DELETE /api/movies/{movie_id}` - Delete movie
- `PATCH /api/movies/{movie_id}/watched` - Toggle watched status

- `GET /api/series/` - List series
- `POST /api/series/` - Create series
- `GET /api/series/{series_id}` - Get series details
- `PUT /api/series/{series_id}` - Update series
- `DELETE /api/series/{series_id}` - Delete series

- `GET /api/episodes/` - List episodes
- `POST /api/episodes/` - Create episode
- `GET /api/episodes/{episode_id}` - Get episode details
- `PUT /api/episodes/{episode_id}` - Update episode
- `DELETE /api/episodes/{episode_id}` - Delete episode
- `PATCH /api/episodes/{episode_id}/watched` - Toggle watched status
- `GET /api/episodes/{episode_id}/details` - Get episode details

### List Management Endpoints
- `GET /api/lists` - List all lists
- `POST /api/lists` - Create list
- `PUT /api/lists/{list_id}` - Update list
- `DELETE /api/lists/{list_id}` - Delete list
- `GET /api/lists/{list_id}/items` - Get list items
- `POST /api/lists/{list_id}/items` - Add item to list
- `DELETE /api/lists/{list_id}/items/{item_id}` - Remove item from list
- `PATCH /api/lists/{list_id}/items/{item_id}/watched` - Toggle item watched status
- `POST /api/lists/{list_id}/share` - Share list
- `DELETE /api/lists/{list_id}/unshare` - Unshare list

### Watchlist Endpoints
- `GET /api/watchlist` - Get watchlist
- `POST /api/watchlist/movie/{movie_id}/toggle` - Toggle movie in watchlist
- `POST /api/watchlist/series/{series_id}/toggle` - Toggle series in watchlist
- `POST /api/watchlist/collection/{collection_id}/toggle` - Toggle collection in watchlist
- `DELETE /api/watchlist/movie/{movie_id}` - Remove movie from watchlist
- `DELETE /api/watchlist/series/{series_id}` - Remove series from watchlist
- `DELETE /api/watchlist/clear` - Clear watchlist
- `POST /api/watchlist/{item_type}/{item_id}/interacted` - Mark item as interacted
- `GET /api/watchlist/unwatched/` - Get unwatched items

### Search Endpoints
- `GET /api/search/movies/` - Search movies
- `GET /api/search/series/` - Search series
- `GET /api/search/all/` - Search all content

### Import Endpoints
- `POST /api/import/movie/{imdb_id}` - Import movie
- `POST /api/import/movie/{imdb_id}/sequels` - Import movie with sequels
- `POST /api/import/series/{imdb_id}` - Import series
- `POST /api/import/series/{imdb_id}/full` - Import series with all episodes
- `POST /api/import/by_url/` - Import by URL
- `POST /api/import/url` - Import by URL (alternative)
- `POST /api/share/import` - Import shared content

### Jellyfin Integration Endpoints
- `GET /api/import/jellyfin/libraries` - Get Jellyfin libraries
- `POST /api/import/jellyfin/` - Import from Jellyfin
- `GET /api/import/jellyfin/progress` - Get import progress
- `GET /api/import/jellyfin/pre-scan/{library_name}` - Pre-scan library
- `GET /api/import/jellyfin/libraries-debug` - Debug libraries
- `GET /api/import/jellyfin/debug` - Debug Jellyfin
- `GET /api/import/jellyfin/test-auth` - Test Jellyfin auth
- `GET /api/import/jellyfin/test-libraries` - Test Jellyfin libraries
- `GET /api/import/jellyfin/debug-movie-data` - Debug movie data
- `GET /api/import/jellyfin/debug-provider-ids` - Debug provider IDs

### Statistics Endpoints
- `GET /api/stats` - Get statistics
- `GET /api/stats/` - Get statistics (alternative)

### Notification Endpoints
- `GET /api/notifications/new-releases` - Get new releases
- `POST /api/notifications/mark-seen` - Mark notifications as seen
- `GET /api/notifications/details` - Get notification details

### Admin Endpoints
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/{user_id}` - Get user details
- `PUT /api/admin/users/{user_id}` - Update user
- `DELETE /api/admin/users/{user_id}` - Delete user
- `POST /api/admin/users/{user_id}/toggle-admin` - Toggle admin status
- `POST /api/admin/users/{user_id}/clear-data` - Clear user data
- `POST /api/admin/users/{user_id}/reset-password` - Reset user password
- `POST /api/admin/users/{user_id}/remove-duplicates` - Remove user duplicates
- `GET /api/admin/dashboard` - Get admin dashboard
- `POST /api/admin/clear_all` - Clear all data
- `POST /api/admin/fetch-all-sequels` - Fetch all sequels
- `POST /api/admin/check-releases` - Check for new releases
- `POST /api/admin/trigger-automated-import` - Trigger automated import
- `GET /api/admin/library-import-history` - Get library import history
- `GET /api/admin/progress-performance` - Get progress performance

### Utility Endpoints
- `GET /api/` - API info
- `GET /api/test-db` - Test database connection
- `GET /api/version` - Get version info
- `GET /api/debug/movies` - Debug movies
- `GET /api/lists/test` - Test lists

## Authentication Requirements

### Current JWT Authentication
- **Header**: `Authorization: Bearer <jwt_token>`
- **Token Type**: JWT with user information
- **Expiration**: Configurable (default 30 days)
- **User Context**: Available in all protected endpoints

### Required for iOS Client
1. **Login Flow**: `POST /api/auth/login` → Store JWT → Include in all requests
2. **User Info**: `GET /api/auth/me` for current user details
3. **Token Refresh**: Current system doesn't have refresh, but tokens last 30 days
4. **Logout**: No explicit logout endpoint, client just discards token

## Response Formats

### Standard Success Response
```json
{
  "data": {...},
  "message": "Success"
}
```

### Error Response
```json
{
  "detail": "Error message"
}
```

### Authentication Response
```json
{
  "access_token": "jwt_token_here",
  "token_type": "bearer"
}
```

## Critical for iOS Compatibility

### Must Preserve
1. **All API endpoints** - iOS client depends on these
2. **JWT authentication flow** - iOS client expects this
3. **Response formats** - iOS client parses these
4. **Error handling** - iOS client handles these
5. **User context** - All endpoints expect current user

### Can Change
1. **Frontend authentication UI** - iOS doesn't use this
2. **Web-specific endpoints** - `/login`, `/admin` pages
3. **Static file serving** - iOS doesn't use this

## Supabase Integration Strategy

### Option 1: Dual Authentication (Recommended)
- Keep existing JWT system for iOS compatibility
- Add Supabase for web frontend only
- Use middleware to handle both auth types

### Option 2: JWT Bridge
- Use Supabase for authentication
- Generate JWT tokens for iOS compatibility
- Maintain existing API structure

### Option 3: Complete Migration
- Migrate iOS client to use Supabase directly
- Requires iOS client updates
- More complex but cleaner long-term

## Implementation Plan

### Phase 1: Preserve iOS Compatibility
1. Keep all existing API endpoints
2. Maintain JWT authentication
3. Add Supabase alongside existing system

### Phase 2: Web-Only Supabase
1. Add Supabase authentication for web frontend
2. Keep JWT system for API endpoints
3. Use middleware to bridge both systems

### Phase 3: Optional iOS Migration
1. Create Supabase-compatible API endpoints
2. Update iOS client to use Supabase
3. Deprecate JWT system

## Next Steps

1. **Clean up broken implementation**
2. **Implement dual authentication system**
3. **Test iOS compatibility**
4. **Deploy and validate**
