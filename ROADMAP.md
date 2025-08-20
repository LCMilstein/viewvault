# Watchlist App Roadmap

## 🎯 Current Status
- ✅ UI flash issue fixed (collections/series expansion)
- ✅ Backend import errors resolved
- ✅ Advanced filtering implemented
- ✅ Unified search/watchlist page implemented
- ✅ **Multi-List Support**: Create and manage multiple custom watchlists
- ✅ **Multi-User Support**: User authentication, data isolation, admin roles
- ✅ **List Sharing**: Frontend interface for sharing lists between users
- ✅ **Import to Specific Lists**: Modified import flow to allow users to choose which list(s) to import to
- ✅ **Collection Management**: Complete checkbox behavior, confirmations, real-time updates
- ✅ **Filter System**: All filtering functionality working correctly
- 🔄 **Testing Phase**: Current build being deployed and tested

## 🚀 Next Priority Features

### 1. Item Details Page
**Priority**: High  
**Status**: Planned  
**Description**: Add a detailed view page that users can access by clicking on watchlist entries (poster, title, or blank space - but not checkboxes, dropdown arrows, or delete buttons).

**Implementation Notes**:
- Larger poster display
- Movie/show title and release year/date
- Watch time information
- Quality badges (HD, 4K, etc.)
- Delete button functionality
- Collection information (if applicable)
- Synopsis/plot summary
- Genre information
- Director/writer credits
- Studio information
- Rating information (IMDB, etc.)
- Tags/keywords
- **User notes field**: Free text area for personal notes (e.g., "suggested by Dave", "watch with Sarah", etc.)

**Design Inspiration**: Similar to Jellyfin details page layout with:
- Large poster on the left
- Detailed information on the right
- Dark theme with white text
- Blurred background image
- Clean, organized information layout
- **Note**: Exclude video/audio codec information as that's more appropriate for playback interfaces

**Benefits**:
- Better user experience for viewing item details
- More comprehensive information display
- Consistent with modern media management interfaces
- Enhanced visual presentation

### 2. Collection Management Improvements
**Priority**: High  
**Status**: ✅ **Completed**  
**Description**: Improve collection checkbox behavior and add confirmation dialogs for better user control.

**Implementation Notes**:
- ✅ **Collection Checkbox Behavior**: When clicking a collection checkbox, all items in the collection are checked/unchecked immediately
- ✅ **Confirmation Dialog**: Shows confirmation when checking/unchecking collections with mixed states
- ✅ **Mixed State Handling**: Visual indication and proper logic for collections with some items checked and others unchecked
- ✅ **Real-time UI Updates**: Collection actions immediately reflect on all child items without page refresh

**Benefits**:
- ✅ Better user experience with immediate feedback
- ✅ Clearer understanding of collection-level actions
- ✅ No page refreshes needed

### 3. Filter System Fixes
**Priority**: High  
**Status**: ✅ **Completed**  
**Description**: Fix watchtime filtering and improve overall filter functionality.

**Implementation Notes**:
- ✅ Fixed watchtime filter logic
- ✅ All filter types work correctly
- ✅ Proper filter state management implemented
- ✅ Filter combinations tested and working

### 4. Deleted Items Management
**Priority**: Medium  
**Status**: Planned  
**Description**: Implement proper handling of deleted items to maintain data integrity while hiding from UI.

**Implementation Notes**:
- **Soft Delete**: Mark items as deleted rather than removing from database
- **Hidden State**: Deleted items should be hidden from UI but preserved in data
- **Collection Cleanup**: Handle collections that become empty due to deletions
- **Data Preservation**: Maintain knowledge of deleted items for analytics/audit

**Use Cases**:
- User deletes unwanted sequels but wants to maintain record
- Collections that become empty due to deletions
- Historical tracking of user preferences

### 5. Collection Accuracy Improvements
**Priority**: Medium  
**Status**: Planned  
**Description**: Improve collection detection accuracy and handle edge cases.

**Implementation Notes**:
- **False Positive Detection**: Better logic to avoid false sequel relationships
- **Manual Override**: Allow users to manually correct collection assignments
- **Collection Splitting**: Ability to split incorrectly grouped collections
- **Data Validation**: Validate collection relationships before creation

**Examples to Fix**:
- "Robert the Bruce" incorrectly grouped with "Braveheart"
- Single-movie collections like "The Space Odyssey Series"
- Related but non-sequel movies

### 6. Offline Functionality and Cache
**Priority**: High  
**Status**: Planned  
**Description**: Implement offline-first functionality with service worker caching and local storage for improved user experience.

**Implementation Notes**:
- Service worker for offline caching
- Local storage for offline data persistence
- Cache management for API responses
- Offline-first functionality for watchlist operations
- Background sync for when connection is restored

**Benefits**:
- Works without internet connection
- Faster loading times
- Better user experience on slow connections

---

## 📋 Future Features

### 2. Enhanced Filtering Options
**Priority**: Medium  
**Status**: Completed  
**Description**: Expand filtering capabilities with more granular options.

**Implementation Notes**:
- Filter by watchtime (actual episode/movie watchtime)
- Filter by watch status (watched/unwatched)
- Filter by content type (movies/series/collections)
- Advanced search with multiple criteria

### 3. Additional Filtering Options
**Priority**: Medium  
**Status**: Planned  
**Description**: Expand filtering capabilities with additional granular options.

**Potential Features**:
- Filter by genre
- Filter by release year/decade
- Filter by rating (IMDB/TMDB)
- Filter by content type (movies/series/collections)
- Advanced search with multiple criteria

### 4. User Preferences and Settings
**Priority**: Medium  
**Status**: Planned  
**Description**: Add user-configurable settings and preferences.

**Potential Features**:
- Default view preferences
- Filter presets
- UI theme options
- Notification settings
- Export/import watchlist data

### 5. Mobile App Development
**Priority**: Low  
**Status**: Future  
**Description**: Native iOS/Android applications for mobile users.

**Implementation Notes**:
- React Native or Flutter consideration
- Native mobile features (notifications, widgets)
- Offline-first mobile experience
- Sync with web application

### 6. Advanced Analytics
**Priority**: Low  
**Status**: Future  
**Description**: Enhanced tracking and analytics for viewing habits.

**Potential Features**:
- Watch time analytics
- Genre preferences analysis
- Seasonal viewing patterns
- Recommendations based on history
- Export viewing statistics

### 7. Social Features
**Priority**: Low  
**Status**: Future  
**Description**: Add social elements to the watchlist experience.

**Potential Features**:
- Share watchlists with friends
- Collaborative watchlists
- Friend recommendations
- Watch party coordination
- Social media integration

### 8. Integration Enhancements
**Priority**: Low  
**Status**: Future  
**Description**: Expand integrations with external services.

**Potential Features**:
- Additional streaming service integrations
- Calendar integration for release dates
- RSS feeds for entertainment news
- Discord/Slack bot integration
- Email notifications

---

## 🔧 Technical Improvements

### Performance Optimizations
- Database query optimization
- Frontend bundle size reduction
- Image optimization and lazy loading
- API response caching improvements

### Security Enhancements
- Rate limiting improvements
- Input validation hardening
- Security audit and updates
- HTTPS enforcement

### Code Quality
- Unit test coverage expansion
- Integration test implementation
- Code documentation improvements
- Refactoring for maintainability

---

## 📊 Feature Tracking

| Feature | Priority | Status | Target | Notes |
|---------|----------|--------|--------|-------|
| Item Details Page | High | Planned | Q1 2024 | Enhanced user experience |
| Collection Management | High | Planned | Q1 2024 | Checkbox behavior & confirmations |
| Filter System Fixes | High | Planned | Q1 2024 | Watchtime filter & improvements |
| Offline Functionality | High | Planned | Q2 2024 | Next major feature |
| Deleted Items Management | Medium | Planned | Q2 2024 | Soft delete & data preservation |
| Collection Accuracy | Medium | Planned | Q2 2024 | False positive detection |
| Unified Search Page | Medium | Completed | Q4 2024 | UI/UX improvement |
| Enhanced Filtering | Medium | Completed | Q4 2024 | User experience |
| Additional Filtering | Medium | Planned | Q2 2024 | More granular options |
| User Preferences | Medium | Planned | Q3 2024 | Personalization |
| Mobile App | Low | Future | TBD | Long-term goal |
| Analytics | Low | Future | TBD | Data insights |
| Social Features | Low | Future | TBD | Community features |

---

## 🎯 Success Metrics

### User Experience
- Reduced page load times
- Improved offline functionality
- Enhanced filtering accuracy
- Better mobile responsiveness

### Technical Performance
- API response times < 200ms
- 99.9% uptime
- Zero critical security vulnerabilities
- < 2MB initial bundle size

### User Engagement
- Increased daily active users
- Higher watchlist completion rates
- Improved user retention
- Positive user feedback

---

## 📝 Notes

- **Current Focus**: Testing current build and implementing offline functionality
- **Development Approach**: Iterative improvements with user feedback
- **Priority Shifts**: Priorities may change based on user needs and feedback
- **Technical Debt**: Regular refactoring to maintain code quality

---

*Last Updated: December 2024*
*Version: 1.0* 