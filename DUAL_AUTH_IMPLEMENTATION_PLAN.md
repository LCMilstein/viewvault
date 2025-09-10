# Dual Authentication Implementation Plan

## Current System Analysis

### Working JWT System (Preserve for iOS)
- **File**: `security.py` - Clean JWT implementation
- **Endpoints**: `/api/auth/login`, `/api/auth/register`, `/api/auth/me`
- **Token**: JWT with 1-year expiration
- **Header**: `Authorization: Bearer <token>`
- **iOS Dependency**: All 103 API endpoints depend on this

### Current Login Page
- **File**: `static/login.html` - Simple username/password form
- **Features**: Login, register, admin link
- **API Integration**: Uses `/api/auth/login` and `/api/auth/register`

## Implementation Strategy

### Phase 1: Add Supabase Support (Web Only)
1. **Keep existing JWT system** for all API endpoints
2. **Add Supabase authentication** for web frontend only
3. **Create new login page** with OAuth options
4. **Bridge Supabase users** to JWT system

### Phase 2: User Bridge System
1. **Supabase → JWT Bridge**: Convert Supabase users to JWT tokens
2. **User Sync**: Sync Supabase user data to local User table
3. **Session Management**: Handle both auth types seamlessly

### Phase 3: Enhanced Web UI
1. **Modern login page** with OAuth buttons
2. **Social sign-in** (Google, GitHub)
3. **Email authentication** via Supabase
4. **Fallback to JWT** for existing users

## Technical Implementation

### 1. Supabase Integration
```python
# Add to main.py
from supabase import create_client, Client
import os

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
```

### 2. User Bridge Service
```python
# Create supabase_bridge.py
class SupabaseBridge:
    def sync_user(self, supabase_user):
        # Create or update local user from Supabase data
        pass
    
    def create_jwt_for_supabase_user(self, supabase_user):
        # Generate JWT token for Supabase user
        pass
```

### 3. Dual Authentication Middleware
```python
# Modify security.py
def get_current_user_dual(credentials: HTTPAuthorizationCredentials = Depends(security)):
    # Try JWT first, then Supabase
    pass
```

### 4. New Login Page
- **File**: `static/auth-login.html`
- **Features**: OAuth buttons, email auth, fallback to JWT
- **Integration**: Supabase client + JWT bridge

## File Structure

### New Files to Create
```
supabase_bridge.py          # Supabase ↔ JWT bridge
static/auth-login.html      # New OAuth login page
static/supabase-client.js   # Supabase client integration
```

### Files to Modify
```
main.py                     # Add Supabase routes
security.py                 # Add dual auth support
static/login.html           # Keep as fallback
```

### Files to Preserve
```
security.py                 # Core JWT system
All API endpoints           # iOS compatibility
User model                  # Database schema
```

## API Endpoints

### New Supabase Endpoints
- `POST /api/auth/supabase/login` - Supabase OAuth callback
- `POST /api/auth/supabase/register` - Supabase user registration
- `GET /api/auth/supabase/user` - Get Supabase user info

### Preserved JWT Endpoints
- `POST /api/auth/login` - JWT login (iOS compatible)
- `POST /api/auth/register` - JWT registration (iOS compatible)
- `GET /api/auth/me` - JWT user info (iOS compatible)

## User Flow

### Web Users (New)
1. Visit `/login` → Redirect to `/auth-login`
2. Choose OAuth provider (Google, GitHub) or email
3. Authenticate with Supabase
4. Bridge to JWT system
5. Redirect to main app with JWT token

### iOS Users (Existing)
1. Use existing JWT endpoints
2. No changes required
3. Full compatibility maintained

### Existing Web Users
1. Can still use JWT login at `/login`
2. Can migrate to Supabase auth
3. Seamless transition

## Environment Variables

### Required for Supabase
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### Existing JWT Variables
```
SECRET_KEY=your-jwt-secret-key
```

## Testing Strategy

### 1. JWT System Tests
- [ ] All existing API endpoints work
- [ ] iOS client compatibility maintained
- [ ] Admin functions work
- [ ] User management works

### 2. Supabase System Tests
- [ ] OAuth login works (Google, GitHub)
- [ ] Email authentication works
- [ ] User bridge functions correctly
- [ ] JWT generation works

### 3. Integration Tests
- [ ] Both auth systems work together
- [ ] User data syncs correctly
- [ ] Session management works
- [ ] Error handling works

## Deployment Plan

### 1. Local Testing
- Test both auth systems locally
- Verify iOS compatibility
- Test OAuth providers

### 2. Docker Build
- Build multi-architecture image
- Test in Docker environment
- Verify environment variables

### 3. Production Deployment
- Deploy to Docker Hub
- Update Portainer stack
- Test on Synology NAS
- Verify Cloudflare Tunnel

## Success Criteria

- [ ] iOS client works without changes
- [ ] Web users can use OAuth login
- [ ] Existing users can still login
- [ ] Admin functions work
- [ ] All API endpoints work
- [ ] Clean, maintainable code
- [ ] Proper error handling
- [ ] Production deployment successful

## Timeline

- **Day 1**: Implement Supabase bridge
- **Day 2**: Create new login page
- **Day 3**: Test dual authentication
- **Day 4**: iOS compatibility testing
- **Day 5**: Production deployment
- **Day 6**: Final validation
- **Day 7**: Documentation and cleanup
