# Mobile App Feature Parity Guide
## Complete Backend API & Feature Reference for iOS React Native Implementation

**Document Purpose**: This guide provides a comprehensive overview of ALL backend APIs and web app features that need to be implemented in the iOS React Native app to achieve full feature parity.

**Last Updated**: December 2024  
**Web App Version**: Latest (post multi-list/multi-user implementation)

---

## 🏗️ Backend Architecture Overview

### **Base URL & Authentication**
- **API Base**: `http://your-server:8008/api`
- **Authentication**: JWT Bearer tokens in `Authorization` header
- **Auth Flow**: Login → Store JWT → Include in all API calls

### **Database Models**
```sql
-- Core Models
User (id, username, email, hashed_password, is_active, is_admin)
List (id, user_id, name, description, type, color, background_color, icon, is_active, created_at, updated_at, deleted)
ListItem (id, list_id, item_type, item_id, watched, watched_by, watched_at, added_at, notes, deleted)
ListPermission (id, list_id, shared_with_user_id, permission_level, created_at, deleted)
Movie (id, user_id, title, imdb_id, release_date, runtime, watched, type, collection_id, collection_name, poster_url, poster_thumb, is_new, quality, overview, notes, added_at, deleted)
Series (id, user_id, title, imdb_id, type, poster_url, poster_thumb, is_new, average_episode_runtime, notes, deleted, added_at)
Episode (id, series_id, season_number, episode_number, title, air_date, watched, overview, notes, deleted)
```

---

## 🔐 Authentication API

### **POST /api/auth/register**
```json
{
  "username": "string",
  "email": "string", 
  "password": "string"
}
```
**Response**: `{access_token: "jwt", token_type: "bearer"}`

### **POST /api/auth/login**  
```json
{
  "username": "string",
  "password": "string"
}
```
**Response**: `{access_token: "jwt", token_type: "bearer"}`

### **GET /api/auth/me**
**Headers**: `Authorization: Bearer {token}`  
**Response**: `{id, username, email, is_admin}`

---

## 📋 Multi-List System API

### **Core List Management**

#### **GET /api/lists**
**Returns**: User's own lists + shared lists with permissions
```json
{
  "user_lists": [
    {
      "id": 1,
      "name": "My Custom List",
      "description": "Description text",
      "type": "custom",
      "color": "#007AFF",
      "background_color": "#1a1a2e", 
      "icon": "🎬",
      "is_active": true
    }
  ],
  "shared_lists": [
    {
      "id": 2,
      "name": "Friend's List",
      "owner_username": "friend123",
      "permission_level": "view"
    }
  ],
  "personal_list": {
    "id": "personal",
    "name": "My Watchlist", 
    "description": "Your personal watchlist",
    "type": "personal"
  }
}
```

#### **POST /api/lists**
```json
{
  "name": "List Name",
  "description": "Optional description",
  "color": "#007AFF",
  "background_color": "#1a1a2e",
  "icon": "🎬"
}
```

#### **PUT /api/lists/{list_id}**
```json
{
  "name": "Updated Name",
  "description": "Updated description", 
  "color": "#FF0000",
  "icon": "📺"
}
```

#### **DELETE /api/lists/{list_id}**
**Effect**: Soft deletes the list

### **List Sharing**

#### **POST /api/lists/{list_id}/share**
```json
{
  "shared_with_username": "friend123",
  "permission_level": "view" // or "edit"
}
```

#### **DELETE /api/lists/{list_id}/unshare**
```json
{
  "shared_with_username": "friend123"
}
```

### **List Items Management**

#### **GET /api/lists/{list_id}/items**
**Returns**: All items in the specific list
```json
{
  "movies": [...],
  "series": [...], 
  "collections": [...]
}
```

#### **POST /api/lists/{list_id}/items**
```json
{
  "item_type": "movie", // or "series"
  "item_id": 123
}
```

#### **DELETE /api/lists/{list_id}/items/{item_id}**
**Effect**: Removes item from the specific list

#### **PATCH /api/lists/{list_id}/items/{item_id}/watched**
```json
{
  "watched": true,
  "watched_by": "you" // or "family" or "both"
}
```

---

## 🎬 Content Management API

### **Watchlist Data**

#### **GET /api/watchlist** 
**Returns**: Complete watchlist with collections, series, and standalone movies
```json
{
  "collections": [
    {
      "id": 12345,
      "title": "Marvel Cinematic Universe",
      "poster_url": "https://...",
      "overview": "Collection description from TMDB",
      "items": [
        {
          "id": 1,
          "title": "Iron Man",
          "imdb_id": "tt0371746",
          "release_date": "2008-05-02",
          "watched": false,
          "collection_id": 12345,
          "collection_title": "Marvel Cinematic Universe",
          "poster_url": "https://...",
          "quality": "HD",
          "runtime": 126,
          "overview": "Movie description from TMDB",
          "added_at": "2024-01-01T00:00:00Z",
          "is_new": false
        }
      ]
    }
  ],
  "series": [...],
  "movies": [...] // standalone movies not in collections
}
```

### **Individual Content APIs**

#### **GET /api/movies/{movie_id}**
**Returns**: Detailed movie information

#### **PUT /api/movies/{movie_id}**
```json
{
  "watched": true,
  "notes": "Great movie!"
}
```

#### **PATCH /api/movies/{movie_id}/watched**
```json
{
  "watched": true
}
```

#### **DELETE /api/movies/{movie_id}**
**Effect**: Soft deletes the movie

### **Series & Episodes**

#### **GET /api/series/{series_id}**
**Returns**: Series with all episodes

#### **PATCH /api/episodes/{episode_id}/watched**
```json
{
  "watched": true
}
```

#### **POST /api/series/{series_id}/episodes/{season}/{episode}/toggle**
**Effect**: Toggles episode watched status

---

## 🔍 Search & Discovery API

### **GET /api/search/all/?query={search_term}**
**Returns**: Combined movie and TV series search results from TMDB
```json
[
  {
    "title": "Movie Title",
    "imdb_id": "tt1234567", 
    "release_date": "2024-01-01",
    "poster_url": "https://...",
    "type": "movie"
  },
  {
    "title": "TV Series Title",
    "imdb_id": "tt7654321",
    "poster_url": "https://...", 
    "type": "series"
  }
]
```

### **GET /api/search/movies/?query={search_term}**
**Returns**: Movie-only search results

### **GET /api/search/series/?query={search_term}**  
**Returns**: TV series-only search results

---

## 📥 Import System API

### **Jellyfin Integration**

#### **GET /api/import/jellyfin/libraries**
**Returns**: Available Jellyfin libraries
```json
[
  {
    "Id": "library-id",
    "Name": "Movies",
    "CollectionType": "movies"
  }
]
```

#### **POST /api/import/jellyfin/**
```json
{
  "library_id": "jellyfin-library-id",
  "target_list_ids": ["personal", "1", "2"] // Lists to import to
}
```
**Returns**: Import progress and results

### **Manual Import**

#### **POST /api/import/movie/{imdb_id}**
**Effect**: Imports single movie by IMDB ID

#### **POST /api/import/movie/{imdb_id}/sequels**  
**Effect**: Imports movie + all sequels/collection movies

#### **POST /api/import/series/{imdb_id}**
**Effect**: Imports TV series

#### **POST /api/import/series/{imdb_id}/full**
**Effect**: Imports TV series with all episodes

#### **POST /api/import/by_url/**
```json
{
  "url": "https://imdb.com/title/tt1234567"
}
```
**Effect**: Auto-detects and imports from URL

---

## 🔔 Notifications API

### **GET /api/notifications/new-releases**
**Returns**: Count of new sequel/episode releases

### **GET /api/notifications/details** 
**Returns**: Detailed list of new releases

### **POST /api/notifications/mark-seen**
**Effect**: Marks notifications as seen

---

## ⚙️ Admin API (Admin Users Only)

### **GET /api/admin/users**
**Returns**: List of all users

### **GET /api/admin/users/{user_id}**
**Returns**: Detailed user information

### **PUT /api/admin/users/{user_id}**
```json
{
  "username": "new_username",
  "email": "new_email@domain.com",
  "is_admin": true
}
```

### **POST /api/admin/users/{user_id}/clear-data**
**Effect**: Clears all user's watchlist data

### **DELETE /api/admin/users/{user_id}**
**Effect**: Deletes user account

### **GET /api/admin/dashboard**
**Returns**: System statistics and overview

---

## 🎨 UI Features & Behavior Patterns

### **Multi-List Selection UI**
- **List Chips**: Horizontal scrollable list of user's lists
- **Multi-Select**: Allow selecting multiple lists simultaneously  
- **Personal List**: Always available as "My Watchlist"
- **Visual States**: Active/inactive list indicators
- **Colors**: Each list has custom color and icon

### **List Management Interface**
- **Create List Modal**: Name, description, color picker, icon selector
- **Edit List**: Modify existing list properties
- **List Settings**: Background colors, sharing options
- **Delete Confirmation**: Confirm before list deletion

### **Sharing UI**
- **Share Modal**: Username input + permission level (view/edit)
- **Shared Lists Tab**: View lists shared with you
- **Owner Display**: Show who owns shared lists
- **Unshare Option**: Remove sharing access

### **Import Flow UI**
- **Library Selection**: Choose Jellyfin library to import from
- **List Selection**: Multi-select which lists to import to
- **Progress Indicators**: Show import progress and results
- **Result Toast**: Display imported/updated/skipped counts

### **Collection Management**
- **Collection Details Page**: Full-screen view with movie grid
- **Checkbox Behavior**: Check collection = check all movies
- **Mixed State**: Visual indicator for partially watched collections  
- **Confirmation Dialogs**: Confirm bulk actions on collections

### **Detail Views**
- **Movie Details Modal**: Poster, metadata, description, notes
- **Series Details**: Episode list with season organization
- **Collection Overview**: Description and movie grid
- **Notes System**: User can add personal notes to any item

### **Search & Discovery**  
- **Unified Search**: Search both movies and series
- **Search Results**: Grid layout with posters
- **Quick Add**: Add directly to lists from search results
- **Auto-Import**: Detect URLs and import automatically

### **Settings & Admin**
- **User Profile**: Edit account details
- **Admin Panel**: User management (admin only)
- **Preferences**: Default list selection, notification settings

---

## 🔧 Key Implementation Patterns

### **Authentication Flow**
1. Login screen with username/password
2. Store JWT token securely (Keychain on iOS)
3. Include token in all API headers
4. Handle token expiration gracefully
5. Auto-logout on invalid token

### **Data Management** 
- **Offline Storage**: Cache watchlist data locally
- **Sync Strategy**: Pull latest on app open, push changes immediately
- **Conflict Resolution**: Server data takes precedence
- **Loading States**: Show loading indicators during API calls

### **List Management Pattern**
- **Default Selection**: Remember user's last selected lists
- **Multi-Select UI**: Checkboxes or toggle buttons for list selection
- **Real-time Updates**: Reflect changes immediately in UI
- **Undo Functionality**: Allow undo for accidental actions

### **Error Handling**
- **Network Errors**: Graceful offline mode
- **API Errors**: User-friendly error messages
- **Validation**: Client-side validation for forms
- **Retry Logic**: Automatic retry for failed requests

### **Performance Optimization**
- **Image Caching**: Cache movie posters locally
- **Lazy Loading**: Load images as needed
- **Pagination**: For large lists (if needed)
- **Background Sync**: Sync data when app becomes active

---

## 🎯 Critical Features for Parity

### **Must-Have Features**
1. ✅ **Multi-List Support**: Create, edit, delete custom lists
2. ✅ **List Sharing**: Share lists with other users
3. ✅ **Import to Multiple Lists**: Choose which lists to import to
4. ✅ **Collection Management**: Proper collection handling with descriptions
5. ✅ **Search & Import**: Full search and import functionality
6. ✅ **User Authentication**: Login, registration, profile management
7. ✅ **Jellyfin Integration**: Library browsing and import
8. ✅ **Notes System**: Personal notes on movies/series/episodes
9. ✅ **Watch Status Tracking**: Individual and bulk watch status updates
10. ✅ **Admin Features**: User management (for admin users)

### **UI/UX Parity**
- **Dark Theme**: Match web app's dark blue/purple theme
- **Navigation**: Tab-based navigation (Watchlist, Lists, Search, Profile)
- **Modals**: Detail views, list creation, sharing interfaces
- **Toasts**: Success/error notifications
- **Pull-to-Refresh**: Refresh watchlist data
- **Search Interface**: Combined movie/TV search with filters

### **Data Sync Requirements** 
- **Real-time**: Changes appear immediately across devices
- **Bi-directional**: Web ↔ Mobile sync
- **Conflict Resolution**: Handle concurrent edits gracefully
- **Offline Support**: Basic offline viewing of cached data

---

## 🚨 Important Implementation Notes

### **Authentication**
- Store JWT securely in iOS Keychain
- Include `Authorization: Bearer {token}` in ALL authenticated requests
- Handle 401 responses by redirecting to login

### **List Types**
- **"personal"**: Special list ID, always available, cannot be deleted
- **Custom lists**: User-created lists with numeric IDs
- **Shared lists**: Lists owned by other users, read-only unless edit permission

### **Multi-List Selection**
- Allow multiple list selection simultaneously
- Store user's preferred lists in local storage
- "Personal" list should be selected by default

### **Import Flow**
- Always include "personal" in target lists
- Allow adding to multiple custom lists simultaneously
- Show import progress and final results

### **Error Handling**
- 500 errors usually indicate server issues
- 404 errors mean content not found
- 401 errors mean authentication failed
- 403 errors mean insufficient permissions

### **Performance**
- Cache poster images locally
- Implement proper loading states
- Use lazy loading for large lists
- Optimize API calls (don't refetch unchanged data)

---

## 📱 Recommended iOS App Structure

```
📁 ios-app/
├── 📁 src/
│   ├── 📁 components/
│   │   ├── ListCard.jsx
│   │   ├── MovieCard.jsx
│   │   ├── CollectionView.jsx
│   │   └── DetailModal.jsx
│   ├── 📁 screens/
│   │   ├── WatchlistScreen.jsx
│   │   ├── ListsScreen.jsx
│   │   ├── SearchScreen.jsx
│   │   ├── ProfileScreen.jsx
│   │   └── AdminScreen.jsx
│   ├── 📁 services/
│   │   ├── api.js
│   │   ├── auth.js
│   │   └── storage.js
│   ├── 📁 hooks/
│   │   ├── useAuth.js
│   │   ├── useLists.js
│   │   └── useWatchlist.js
│   └── 📁 utils/
│       ├── constants.js
│       └── helpers.js
```

---

## 🎉 Success Criteria

The iOS app achieves parity when:
- ✅ Users can perform ALL actions available in web app
- ✅ Data syncs perfectly between web and mobile
- ✅ UI follows iOS design patterns while maintaining brand consistency
- ✅ Performance is smooth with proper loading states
- ✅ Offline viewing works for cached content
- ✅ All API endpoints are properly integrated
- ✅ Error handling provides good user experience

---

**Good luck with the mobile implementation! This web app has become a really comprehensive watchlist management system with excellent multi-user and multi-list capabilities. The iOS app should be fantastic! 🚀**
