# 📱 iOS Development Guide - ViewVault Mobile App

## 🎉 **CURRENT STATUS: Backend Ready for iOS Integration**

The ViewVault backend now has **fully functional Auth0 Universal Login** and is ready for iOS app integration. The web client is working perfectly as a reference implementation.

## 🌐 **Backend Configuration**

### Production Endpoint
- **URL**: `https://app.viewvault.app`
- **Docker Image**: `lcmilstein/viewvault:latest` (multi-arch: linux/amd64, linux/arm64)
- **Status**: ✅ Production ready with Auth0 Universal Login

### Auth0 Configuration
- **Domain**: `dev-a6z1zwjm1wj3xpjg.us.auth0.com`
- **Web Client ID**: `6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw`
- **Mobile Client ID**: (Check your existing iOS Auth0 configuration)
- **Audience**: (Check your existing iOS Auth0 configuration)

## 🔐 **Authentication Flow**

### Current Working Implementation (Web Client)
1. **User opens app** → Check for existing token in secure storage
2. **If no token** → Redirect to Auth0 Universal Login
3. **User logs in via Auth0** → Google, GitHub, or email/password
4. **Auth0 callback** → Returns authorization code
5. **Backend processes code** → Creates ViewVault JWT
6. **JWT stored** → Used for all API calls

### iOS Implementation Requirements
```swift
// 1. Check for existing token
let token = Keychain.shared.get("viewvault_token")

// 2. If no token, redirect to Auth0 Universal Login
if token == nil {
    // Open Auth0 Universal Login URL
    let authURL = "https://dev-a6z1zwjm1wj3xpjg.us.auth0.com/authorize?client_id=YOUR_MOBILE_CLIENT_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI&scope=openid profile email"
}

// 3. Handle Auth0 callback
func handleAuth0Callback(authorizationCode: String) {
    // Exchange code for token via backend
    let response = await exchangeCodeForToken(code: authorizationCode)
    // Store JWT for API calls
    Keychain.shared.set(response.jwt, forKey: "viewvault_token")
}
```

## 📡 **API Endpoints**

### Authentication Endpoints
- `GET /login` - Redirects to Auth0 Universal Login
- `GET /register` - Redirects to Auth0 Universal Login for signup
- `GET /auth0/callback` - Processes Auth0 authorization code
- `GET /api/auth/me` - Get current user info (requires JWT)

### Core Data Endpoints
- `GET /api/movies/` - List movies
- `GET /api/series/` - List series
- `GET /api/episodes/` - List episodes
- `GET /api/lists` - List all lists
- `GET /api/watchlist` - Get user's watchlist

### Movie/Series Management
- `POST /api/movies/` - Create movie
- `PUT /api/movies/{movie_id}` - Update movie
- `DELETE /api/movies/{movie_id}` - Delete movie
- `PATCH /api/movies/{movie_id}/watched` - Toggle watched status

### List Management
- `POST /api/lists` - Create list
- `PUT /api/lists/{list_id}` - Update list
- `DELETE /api/lists/{list_id}` - Delete list
- `POST /api/lists/{list_id}/items` - Add item to list
- `DELETE /api/lists/{list_id}/items/{item_id}` - Remove item from list

## 🛠 **Implementation Steps**

### Step 1: Update API Configuration
```swift
// Update your base URL configuration
struct APIConfig {
    static let baseURL = "https://app.viewvault.app"
    static let auth0Domain = "dev-a6z1zwjm1wj3xpjg.us.auth0.com"
    static let mobileClientID = "YOUR_MOBILE_CLIENT_ID"
}
```

### Step 2: Implement Auth0 Universal Login
```swift
// Add Auth0 SDK to your project
// Configure Auth0 in your app delegate
// Implement login/logout flows
```

### Step 3: Handle Authentication State
```swift
// Create authentication manager
class AuthManager: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    
    func login() {
        // Redirect to Auth0 Universal Login
    }
    
    func logout() {
        // Clear tokens and redirect to Auth0 logout
    }
    
    func checkAuth() {
        // Check for valid token
    }
}
```

### Step 4: API Service Implementation
```swift
// Create API service with JWT authentication
class APIService {
    private let baseURL = "https://app.viewvault.app"
    
    func makeRequest<T: Codable>(endpoint: String, type: T.Type) async throws -> T {
        let token = Keychain.shared.get("viewvault_token")
        // Make authenticated request with JWT
    }
}
```

## ✅ **Testing Checklist**

### Authentication Testing
- [ ] **Login flow** - User can log in via Auth0
- [ ] **Registration flow** - New users can create accounts
- [ ] **Logout flow** - User can log out without bounce issues
- [ ] **Token persistence** - App remembers login state
- [ ] **Token refresh** - Handles expired tokens gracefully

### API Integration Testing
- [ ] **User profile** - Can fetch current user data
- [ ] **Movies/Series** - Can browse and manage content
- [ ] **Lists** - Can create and manage lists
- [ ] **Watchlist** - Can add/remove items from watchlist
- [ ] **Search** - Can search for movies and series
- [ ] **Import** - Can import content from external sources

### Error Handling Testing
- [ ] **Network errors** - Graceful handling of network issues
- [ ] **Authentication errors** - Proper handling of auth failures
- [ ] **API errors** - User-friendly error messages
- [ ] **Token expiration** - Automatic re-authentication

## 🔧 **Development Environment**

### Local Development
- **Backend**: Use `https://app.viewvault.app` (production backend)
- **Testing**: Test from different networks (not just local)
- **Debugging**: Use browser dev tools to inspect web client behavior

### Configuration Files to Update
- **API base URL** - Change to `https://app.viewvault.app`
- **Auth0 configuration** - Update domain and client IDs
- **Environment variables** - Set production values
- **Build configurations** - Ensure production settings

## 🚀 **Deployment Strategy**

### Phase 1: Basic Integration
1. Update API endpoints to point to production backend
2. Test basic authentication flow
3. Verify core functionality works

### Phase 2: Full Feature Parity
1. Implement all API endpoints
2. Add error handling and loading states
3. Test all features thoroughly

### Phase 3: Production Ready
1. Add analytics and crash reporting
2. Implement offline capabilities
3. Performance optimization

## 📋 **Common Issues & Solutions**

### Issue: Authentication not working
- **Solution**: Verify Auth0 configuration matches web client
- **Check**: Client ID, domain, and redirect URIs

### Issue: API calls failing
- **Solution**: Ensure JWT token is included in Authorization header
- **Check**: Token format and expiration

### Issue: Logout bounce
- **Solution**: Implement proper Auth0 logout flow
- **Check**: Clear both local tokens and Auth0 session

## 🎯 **Success Metrics**

- ✅ **Web client reference** - Fully working authentication
- ✅ **Backend stability** - Production ready with Auth0
- ✅ **API completeness** - All endpoints documented and working
- ✅ **Multi-arch support** - Docker images work on all platforms

## 📞 **Support & Resources**

### Reference Implementation
- **Web client**: `https://app.viewvault.app` (working reference)
- **Source code**: Available in repository
- **API documentation**: All endpoints documented above

### Troubleshooting
1. **Check web client first** - It's working as reference
2. **Verify Auth0 configuration** - Must match web client
3. **Test API endpoints** - Use browser dev tools
4. **Check container logs** - For backend errors

The web client is now a solid reference implementation for the iOS team to follow! 🚀
