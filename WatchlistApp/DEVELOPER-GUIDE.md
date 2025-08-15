# WatchlistApp Developer Guide

## Overview

This guide is specifically for iOS developers (like Mack) working on the WatchlistApp React Native application. The app provides a native iOS interface for managing your watchlist, viewing details, and managing watched status.

## Project Structure

```
WatchlistApp/
├── src/
│   ├── components/
│   │   └── WatchlistItem.tsx      # Reusable item component
│   ├── screens/
│   │   ├── WatchlistScreen.tsx    # Main watchlist with filters
│   │   └── DetailsScreen.tsx      # Item details and notes
│   ├── services/
│   │   └── api.ts                 # Backend communication
│   └── types/
│       └── index.ts               # TypeScript interfaces
├── ios/                           # Native iOS files
├── android/                       # Native Android files
├── package.json                   # Dependencies
└── README.md                      # Setup instructions
```

## Key Components

### 1. `src/services/api.ts`

**Purpose**: Handles all communication with the FastAPI backend running on your NAS.

**Key Features**:
- Standardized API response format with error handling
- Authentication header management
- Methods for all backend operations (getWatchlist, toggleWatched, etc.)

**Important**: Update the `API_BASE` URL to match your NAS IP address:
```typescript
const API_BASE = 'http://192.168.1.100:8008/api'; // Update with your NAS IP
```

**Methods**:
- `getWatchlist()` - Fetch complete watchlist data
- `toggleWatched(type, id)` - Toggle watched status for movies/series
- `toggleEpisodeWatched(seriesId, season, episode)` - Toggle individual episodes
- `saveNotes(type, id, notes)` - Save notes for items
- `deleteItem(type, id)` - Remove items from watchlist

### 2. `src/screens/WatchlistScreen.tsx`

**Purpose**: Main screen displaying all watchlist items with filtering capabilities.

**Key Features**:
- **Filter System**: Filter by type (movies/series), watched status, and runtime
- **Pull-to-refresh**: Update data from NAS
- **Item Management**: Toggle watched status, delete items
- **Navigation**: Navigate to details screen
- **Error Handling**: Loading states and error messages

**Filter Implementation**:
```typescript
// Filter state management
const [filters, setFilters] = useState({
  movies: true,
  series: true,
  unwatched: false,
  runtime: 'all' as 'all' | 'short' | 'standard' | 'long' | 'epic'
});

// Runtime filter categories
const matchesRuntimeFilter = (runtime: number | undefined, filter: string) => {
  if (!runtime) return true;
  switch (filter) {
    case 'short': return runtime <= 30;
    case 'standard': return runtime > 30 && runtime <= 60;
    case 'long': return runtime > 60 && runtime <= 90;
    case 'epic': return runtime > 90;
    default: return true;
  }
};
```

**Filter UI**: The screen includes filter chips at the top:
- **Type Filters**: Movies, Series (toggle on/off)
- **Status Filter**: Unwatched (toggle on/off)
- **Runtime Filters**: All, ≤30m, 30-60m, 60-90m, >90m (mutually exclusive)

### 3. `src/components/WatchlistItem.tsx`

**Purpose**: Reusable component for displaying individual watchlist items.

**Features**:
- Displays poster image with fallback
- Shows title and contextual subtitle
- Visual watched status indicator (checkbox)
- Delete button for removing items
- Handles different item types (movie, series, collection)

**Item Type Detection**:
```typescript
const isCollection = 'items' in item;
const isSeries = 'episodes' in item;
const isMovie = !isCollection && !isSeries;
```

### 4. `src/types/index.ts`

**Purpose**: TypeScript interfaces defining data structures.

**Key Interfaces**:
- `Movie` - Individual movies with poster, runtime, quality
- `Series` - TV series with episode lists
- `Episode` - Individual episodes within series
- `Collection` - Groups of related movies
- `WatchlistData` - Complete watchlist structure
- `ApiResponse<T>` - Standardized API response format

## Data Flow

1. **App Launch**: `WatchlistScreen` loads and calls `apiService.getWatchlist()`
2. **Data Fetching**: API service communicates with NAS backend
3. **State Management**: Data stored in component state with filters applied
4. **UI Rendering**: `WatchlistItem` components render filtered data
5. **User Interactions**: Filter changes trigger re-renders, actions call API service

## Development Workflow

### Setting Up the Development Environment

1. **Prerequisites**:
   - macOS with Xcode installed
   - Node.js and npm/yarn
   - React Native CLI

2. **Project Setup**:
   ```bash
   cd /Users/leemilstein/Documents/cinesync
   npm install
   cd ios && pod install
   ```

3. **Running the App**:
   ```bash
   npx react-native run-ios
   ```

### Making Changes

1. **Backend Integration**: All changes should work with the existing FastAPI backend
2. **Filter Logic**: Filter implementation matches the web app functionality
3. **Error Handling**: Always include proper error handling and user feedback
4. **TypeScript**: Use proper typing for all new functions and components

### Common Tasks

#### Adding New Filter Options

1. Update the filter state type in `WatchlistScreen.tsx`
2. Add filter logic to `getFlatListData()`
3. Add UI controls to `renderFilterControls()`
4. Update styles for new filter chips

#### Adding New API Endpoints

1. Add method to `api.ts` service
2. Update TypeScript interfaces in `types/index.ts`
3. Implement in the appropriate screen component
4. Add error handling and loading states

#### Modifying the UI

1. Update component styles in the StyleSheet
2. Test on different screen sizes
3. Ensure accessibility features are maintained
4. Follow the existing design patterns

## Backend Integration

### API Endpoints

The app communicates with your NAS backend using these endpoints:

- `GET /api/watchlist` - Fetch complete watchlist
- `POST /api/movies/{id}/toggle` - Toggle movie watched status
- `POST /api/series/{id}/toggle` - Toggle series watched status
- `POST /api/series/{id}/episodes/{season}/{episode}/toggle` - Toggle episode
- `POST /api/movies/{id}/notes` - Save movie notes
- `POST /api/series/{id}/notes` - Save series notes
- `DELETE /api/movies/{id}` - Delete movie
- `DELETE /api/series/{id}` - Delete series

### Data Format

The backend returns data in this structure:
```typescript
{
  collections: Collection[],
  series: Series[],
  movies: Movie[]
}
```

### Error Handling

All API calls use the standardized `ApiResponse<T>` format:
```typescript
{
  data?: T,
  error?: string
}
```

## UI/UX Guidelines

### Design Principles

1. **Dark Theme**: Consistent dark theme throughout the app
2. **Touch-Friendly**: Minimum 44pt touch targets
3. **Visual Feedback**: Clear active states for buttons and filters
4. **Loading States**: Always show loading indicators for async operations
5. **Error States**: Clear error messages with actionable information

### Color Scheme

- **Primary**: `#00d4aa` (teal) - Active states, highlights
- **Background**: `#1a1a1a` (dark gray) - Main background
- **Secondary Background**: `#2a2a2a` (lighter gray) - Cards, sections
- **Text**: `#ffffff` (white) - Primary text
- **Secondary Text**: `#cccccc` (light gray) - Subtitles, descriptions
- **Error**: `#ff6b6b` (red) - Error messages

### Typography

- **Headers**: 18pt, bold
- **Body Text**: 14pt, regular
- **Captions**: 12pt, medium
- **Filter Chips**: 12pt, medium

## Configuration

### Environment Setup

1. **API Base URL**: Update in `src/services/api.ts`
2. **Development vs Production**: Use different URLs for testing
3. **Authentication**: Ensure proper token handling

### Build Configuration

1. **iOS Bundle Identifier**: Update in Xcode project settings
2. **App Icons**: Replace default React Native icons
3. **Launch Screen**: Customize the launch screen
4. **Permissions**: Add necessary permissions to Info.plist

## Debugging Tips

### Common Issues

1. **API Connection**: Check NAS IP address and network connectivity
2. **Filter Logic**: Verify filter state management and data flow
3. **Navigation**: Ensure proper route parameters
4. **Performance**: Monitor FlatList rendering with large datasets

### Debug Tools

1. **React Native Debugger**: For JavaScript debugging
2. **Xcode Console**: For native iOS logs
3. **Network Tab**: Monitor API requests and responses
4. **React DevTools**: For component state inspection

### Testing

1. **Unit Tests**: Test filter logic and API service methods
2. **Integration Tests**: Test complete user workflows
3. **Device Testing**: Test on physical devices, not just simulator

## Resources

### Documentation

- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [React Navigation](https://reactnavigation.org/docs/getting-started)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Backend Coordination

**Important**: When making changes that affect the backend API:

1. **Coordinate with Winnie**: The backend developer who maintains the FastAPI server
2. **API Changes**: Discuss any new endpoints or data format changes
3. **Testing**: Ensure changes work with the deployed backend
4. **Documentation**: Update this guide when adding new features

### Getting Help

1. **Check the code comments**: All major functions have detailed JSDoc comments
2. **Review the web app**: The web version at `static/app.js` shows the intended functionality
3. **Ask Winnie**: For backend API questions or coordination
4. **GitHub Issues**: Create issues for bugs or feature requests

## Recent Updates

### Filter Functionality (Latest)

The `WatchlistScreen` now includes comprehensive filtering capabilities:

- **Type Filters**: Toggle movies and series visibility
- **Status Filter**: Show only unwatched items
- **Runtime Filters**: Filter by duration (≤30m, 30-60m, 60-90m, >90m)
- **Visual Feedback**: Active filter chips with color coding
- **Real-time Filtering**: Instant updates as filters change

The filter implementation matches the web app functionality, ensuring consistent behavior across platforms.

---

**Note**: This guide is maintained by Winnie (backend/web developer) and should be updated whenever new features are added or significant changes are made to the codebase. 