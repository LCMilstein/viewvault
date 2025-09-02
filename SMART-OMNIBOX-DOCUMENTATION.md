# Smart Omnibox Feature Documentation

## Overview

The Smart Omnibox is a unified search interface that combines local watchlist search with external content import search in a single, seamless experience. It provides real-time local search results while intelligently debouncing external API calls to prevent server overload.

## Feature Description

### What It Does
- **Unified Search Interface**: Single search input that searches both local watchlist and external databases
- **Real-time Local Search**: Instant results from user's existing watchlist (movies, series, collections)
- **Debounced Import Search**: Smart external search that waits for user to finish typing before making API calls
- **Hybrid Results Display**: Shows local results as horizontal scrollable cards and import results in a 2-column grid
- **Seamless UX**: Omnibox stays in normal position, maintains focus, and doesn't interfere with normal app usage

### User Experience
1. User types in the omnibox (e.g., "The Godfather")
2. Local results appear immediately as they type
3. After 3+ characters and 1.2 seconds of no typing, external search begins
4. Import results appear in a 2-column grid below local results
5. User can continue typing to refine search or select results
6. Omnibox maintains focus and normal appearance throughout

## Technical Implementation

### Architecture

```
WatchlistScreen
├── SmartOmnibox (search input + local results)
└── Search Results Overlay (when searching)
    ├── Local Results Section (horizontal scroll)
    └── Import Results Grid (2-column layout)
```

### Key Components

#### 1. SmartOmnibox (`src/components/SmartOmnibox.tsx`)
- **Purpose**: Main search input component
- **Features**:
  - Real-time local search with fuzzy matching
  - Debounced external search (3+ chars, 1.2s delay)
  - Local results display in dropdown format
  - Maintains focus and normal appearance

#### 2. Search Results Overlay (in `WatchlistScreen.tsx`)
- **Purpose**: Displays search results below the omnibox
- **Features**:
  - Local results as horizontal scrollable cards
  - Import results in 2-column grid layout
  - Overlays the main watchlist when active

### API Integration

#### Backend Endpoints Used
- **`apiService.searchAll(query)`**: Unified search endpoint for external content
- **`apiService.getWatchlist()`**: For local watchlist data
- **`apiService.importItem()`**: For importing selected items

#### Search Flow
1. **Local Search**: Immediate, client-side filtering of watchlist data
2. **External Search**: Debounced API call to `searchAll()` endpoint
3. **Results Display**: Hybrid UI showing both result types

### State Management

#### Key State Variables
```typescript
// In WatchlistScreen.tsx
const [searchQuery, setSearchQuery] = useState<string>('');
const [isSearching, setIsSearching] = useState(false);
const [isOmniboxSearching, setIsOmniboxSearching] = useState(false);
const [searchResults, setSearchResults] = useState<any[]>([]);
const [isSearchingResults, setIsSearchingResults] = useState(false);

// In SmartOmnibox.tsx
const [query, setQuery] = useState('');
const [localResults, setLocalResults] = useState<LocalSearchResult[]>([]);
const [lastSearchQuery, setLastSearchQuery] = useState('');
```

#### State Flow
1. User types → `query` state updates
2. Local search runs immediately → `localResults` updates
3. Debounce timer starts → after 1.2s, external search begins
4. External search completes → `searchResults` updates
5. UI shows overlay with both result types

## Implementation Details

### Debouncing Logic
```typescript
// Only trigger external search if:
// 1. Query is 3+ characters
// 2. Not currently searching
// 3. Different from last search query
if (query.trim().length >= 3 && !isSearchingResults && query.trim() !== lastSearchQuery) {
  setLastSearchQuery(query.trim());
  onImport(query.trim());
}
```

### Local Search Algorithm
```typescript
// Fuzzy matching on title and year
const query = searchQuery.toLowerCase().trim();
if (title.includes(query) || year.includes(query)) {
  // Add to results
}
```

### Grid Layout
```typescript
// 2-column grid with proper spacing
const cardWidth = (screenWidth - 48) / 2;
// Container uses flexWrap and justifyContent: 'space-between'
```

## Files Modified/Created

### New Files
- `src/components/SmartOmnibox.tsx` - Main omnibox component

### Modified Files
- `src/screens/WatchlistScreen.tsx` - Added search results overlay and integration
- `src/components/QualityBadge.tsx` - Minor debug logging (later removed)

## Backend Team Notes

### API Requirements
The Smart Omnibox relies on the existing `searchAll` endpoint. No backend changes are required, but consider:

1. **Rate Limiting**: The debouncing helps, but consider implementing rate limiting on the search endpoint
2. **Caching**: Search results could be cached for common queries
3. **Pagination**: For large result sets, consider implementing pagination

### Current API Usage
```typescript
// External search
const response = await apiService.searchAll(query.trim());

// Expected response format
{
  data: [
    {
      imdb_id: string,
      title: string,
      type: 'movie' | 'series',
      release_date: string,
      poster_url: string,
      overview?: string
    }
  ]
}
```

## Web Client Team Notes

### UI/UX Considerations
1. **Search Input**: Should maintain focus and normal appearance
2. **Results Display**: 
   - Local results: Horizontal scrollable cards
   - Import results: 2-column grid layout
3. **Debouncing**: Implement similar debouncing (3+ chars, 1.2s delay)
4. **State Management**: Avoid infinite re-render loops with proper dependency arrays

### Key UI Patterns
```typescript
// Local results styling
localResultCard: {
  backgroundColor: '#2a2a2a',
  borderRadius: 8,
  padding: 12,
  marginRight: 12,
  minWidth: 150,
  borderLeftWidth: 3,
  borderLeftColor: '#4ECDC4', // Teal for local
}

// Import results styling
importResultCard: {
  backgroundColor: '#2a2a2a',
  borderRadius: 12,
  marginBottom: 16,
  marginHorizontal: 4,
  borderWidth: 1,
  borderColor: '#444',
}
```

### Responsive Design
- **Card Width**: `(screenWidth - 48) / 2` for 2-column grid
- **Spacing**: 16px padding, 4px margins between cards
- **Typography**: Consistent with existing app theme

## Testing Considerations

### Test Cases
1. **Local Search**: Type partial movie/series names, verify instant results
2. **External Search**: Type 3+ characters, wait 1.2s, verify API call
3. **Debouncing**: Type quickly, verify only final query triggers API call
4. **Focus Management**: Verify omnibox maintains focus during search
5. **Grid Layout**: Verify 2-column layout on different screen sizes
6. **State Persistence**: Verify search state doesn't interfere with app navigation

### Performance Considerations
- **Local Search**: O(n) complexity, runs on every keystroke
- **External Search**: Debounced to prevent API spam
- **Memory**: Results are cleared when search is cleared
- **Rendering**: Uses React.memo and useCallback for optimization

## Future Enhancements

### Potential Improvements
1. **Search History**: Remember recent searches
2. **Search Suggestions**: Auto-complete based on popular queries
3. **Advanced Filters**: Filter by year, genre, etc.
4. **Voice Search**: Integration with device voice recognition
5. **Offline Search**: Cache search results for offline use

### Backend Enhancements
1. **Search Analytics**: Track popular search terms
2. **Personalized Results**: Weight results based on user preferences
3. **Fuzzy Matching**: Improve search algorithm for typos
4. **Search Indexing**: Optimize search performance

## Troubleshooting

### Common Issues
1. **Infinite Re-renders**: Check useCallback dependencies
2. **Focus Loss**: Ensure omnibox doesn't unmount during search
3. **Grid Layout**: Verify card width calculations
4. **API Rate Limiting**: Monitor search endpoint usage

### Debug Logging
The implementation includes comprehensive debug logging with prefixes:
- `🔍 SMART OMNIBOX DEBUG`: Omnibox component logs
- `🔍 WATCHLIST DEBUG`: WatchlistScreen logs
- `🔍 IMPORT DEBUG`: Search API logs

## Conclusion

The Smart Omnibox provides a unified, efficient search experience that combines the best of local and external search. The implementation is designed to be performant, user-friendly, and maintainable. The debouncing strategy prevents API overload while providing responsive local search results.

For web client implementation, focus on maintaining the same UX patterns and debouncing logic. For backend, consider the performance implications of increased search usage and potential optimizations.
