# ViewVault Authentication Cleanup Plan

## Current Status
- **Broken State**: Saved in branch `broken-supabase-auth`
- **Working State**: Restored to `main` branch (commit 11aafa1, tag v1.0.0-rc1)
- **Goal**: Implement clean Supabase authentication while preserving iOS client compatibility

## Issues Found in Broken Implementation

### 1. **Complex Client Architecture**
- **Problem**: Over-engineered `ViewVaultAuthClient` class with complex initialization
- **Issue**: Multiple layers of abstraction causing timing and state management issues
- **Solution**: Use direct Supabase client integration

### 2. **Credential Injection Problems**
- **Problem**: Environment variables not properly injected into HTML
- **Issue**: `SUPABASE_URL_PLACEHOLDER` and `SUPABASE_ANON_KEY_PLACEHOLDER` not being replaced
- **Solution**: Direct credential passing from backend service

### 3. **JavaScript Loading Issues**
- **Problem**: Complex script loading and initialization timing
- **Issue**: `authClient` variable not properly initialized before button clicks
- **Solution**: Simple, direct Supabase integration

### 4. **Multiple Authentication Systems**
- **Problem**: Legacy JWT auth mixed with Supabase auth
- **Issue**: Conflicting authentication flows and middleware
- **Solution**: Clean Supabase-only implementation

### 5. **iOS Client Compatibility**
- **Problem**: Authentication changes may break iOS client
- **Issue**: iOS client expects specific API endpoints and authentication flow
- **Solution**: Maintain backward compatibility

## Clean Implementation Plan

### Phase 1: Analysis and Documentation
1. **Document Current iOS Client Requirements**
   - Analyze existing API endpoints used by iOS client
   - Document authentication flow expectations
   - Identify required headers and response formats

2. **Clean Up Broken Implementation**
   - Remove all Supabase auth files from working version
   - Clean up main.py of auth-related imports
   - Remove unused dependencies

### Phase 2: Simple Supabase Integration
1. **Backend Changes**
   - Add Supabase client initialization
   - Create simple auth endpoints
   - Maintain existing API structure for iOS compatibility

2. **Frontend Changes**
   - Simple HTML login page with direct Supabase integration
   - No complex JavaScript classes
   - Direct OAuth flow implementation

3. **iOS Client Compatibility**
   - Ensure all existing API endpoints work
   - Maintain authentication headers format
   - Preserve response structures

### Phase 3: Testing and Validation
1. **Local Testing**
   - Test authentication flow locally
   - Verify iOS client compatibility
   - Test OAuth providers (Google, GitHub)

2. **Production Deployment**
   - Deploy to Docker Hub
   - Test on Synology NAS
   - Verify Cloudflare Tunnel integration

## Files to Clean Up

### Remove from Working Version:
- `auth_middleware.py`
- `auth_routes.py`
- `supabase_auth_service.py`
- `supabase_service.py`
- `static/auth-client.js`
- `static/auth-login.html`
- `static/simple-auth.html`
- `static/supabase-client.js`
- `static/supabase-login.html`
- `static/nextauth-client.js`
- `nextauth-service/` (entire directory)
- All Docker Compose files with auth
- All Portainer stack files with auth

### Keep for iOS Compatibility:
- All existing API endpoints
- Current authentication middleware structure
- Existing response formats
- Current database schema

## iOS Client Requirements Analysis

### Current API Endpoints Used by iOS:
- `/api/movies/` - Movie management
- `/api/series/` - Series management
- `/api/episodes/` - Episode management
- `/api/watchlist/` - Watchlist management
- `/api/lists/` - List management
- `/api/stats/` - Statistics
- `/api/search/` - Search functionality

### Authentication Headers Expected:
- `Authorization: Bearer <token>`
- Current JWT token format
- User ID in request context

### Response Formats:
- JSON responses
- Standard HTTP status codes
- Error message format

## Implementation Strategy

### 1. **Minimal Supabase Integration**
- Add Supabase client to main.py
- Create simple auth endpoints
- Maintain existing API structure

### 2. **Preserve iOS Compatibility**
- Keep all existing API endpoints
- Maintain authentication header format
- Preserve response structures

### 3. **Simple Frontend**
- Direct Supabase integration
- No complex JavaScript classes
- Clean OAuth flow

### 4. **Gradual Migration**
- Implement Supabase auth alongside existing system
- Test thoroughly before removing old system
- Ensure iOS client continues to work

## Next Steps

1. **Analyze iOS Client Code** (if available)
2. **Clean Up Working Version**
3. **Implement Simple Supabase Auth**
4. **Test iOS Compatibility**
5. **Deploy and Validate**

## Success Criteria

- [ ] Authentication works (Google, GitHub, Email)
- [ ] iOS client continues to work without changes
- [ ] All existing API endpoints function
- [ ] Clean, maintainable code
- [ ] Proper error handling
- [ ] Production deployment successful

## Timeline

- **Day 1-2**: Analysis and cleanup
- **Day 3-4**: Simple Supabase implementation
- **Day 5-6**: Testing and iOS compatibility
- **Day 7**: Final deployment and validation
