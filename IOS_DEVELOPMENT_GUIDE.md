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

#### Step 1: Get Auth0 Universal Login URL
```swift
// Get Auth0 Universal Login URL from backend
func getAuth0LoginURL() async throws -> String {
    let response = try await APIService.shared.get("/api/auth/auth0/mobile/login")
    return response["auth_url"] as! String
}

// For signup
func getAuth0SignupURL() async throws -> String {
    let response = try await APIService.shared.get("/api/auth/auth0/mobile/signup")
    return response["auth_url"] as! String
}
```

#### Step 2: Display Auth0 Universal Login in Native WebView
```swift
// Display Auth0 Universal Login in native WebView
func showAuth0Login() {
    do {
        let authURL = try await getAuth0LoginURL()
        
        // Create WebView controller
        let webView = WKWebView()
        let controller = UIViewController()
        controller.view = webView
        
        // Handle navigation to capture callback
        webView.navigationDelegate = self
        
        // Load Auth0 Universal Login page
        webView.load(URLRequest(url: URL(string: authURL)!))
        
        // Present modally
        present(controller, animated: true)
    } catch {
        print("Failed to get Auth0 login URL: \(error)")
    }
}

// WKNavigationDelegate method to handle Auth0 callback
func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if let url = navigationAction.request.url,
       url.absoluteString.contains("auth0/callback") {
        
        // Extract authorization code from URL
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        if let code = components?.queryItems?.first(where: { $0.name == "code" })?.value {
            // Handle the callback
            Task {
                await handleAuth0Callback(authorizationCode: code)
                // Dismiss WebView
                dismiss(animated: true)
            }
        }
        decisionHandler(.cancel)
    } else {
        decisionHandler(.allow)
    }
}
```

#### Step 3: Handle Auth0 Callback
```swift
// Handle Auth0 callback with authorization code
func handleAuth0Callback(authorizationCode: String) async throws {
    let requestBody = ["code": authorizationCode]
    let response = try await APIService.shared.post("/api/auth/auth0/mobile/callback", body: requestBody)
    
    // Store JWT for API calls
    let jwtToken = response["access_token"] as! String
    Keychain.shared.set(jwtToken, forKey: "viewvault_token")
}
```

#### Step 4: Check Authentication Status
```swift
// Check for existing token
func checkAuthStatus() -> Bool {
    let token = Keychain.shared.get("viewvault_token")
    return token != nil && !isTokenExpired(token!)
}
```

## 📡 **API Endpoints**

### Authentication Endpoints
#### Web Endpoints (for reference)
- `GET /login` - Redirects to Auth0 Universal Login
- `GET /register` - Redirects to Auth0 Universal Login for signup
- `GET /auth0/callback` - Processes Auth0 authorization code

#### Mobile Endpoints (for iOS)
- `GET /api/auth/auth0/mobile/login` - Get Auth0 Universal Login URL for mobile login
- `GET /api/auth/auth0/mobile/signup` - Get Auth0 Universal Login URL for mobile signup
- `POST /api/auth/auth0/mobile/callback` - Process Auth0 authorization code for mobile
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

## 📱 **Native iOS Experience**

### **In-App Authentication (Recommended)**
The iOS app should provide a **native in-app experience** using `WKWebView` to display Auth0 Universal Login pages. This provides:

- ✅ **Seamless UX** - Users stay within the app
- ✅ **Native feel** - Custom styling and branding
- ✅ **Better control** - Handle callbacks without browser redirects
- ✅ **Consistent experience** - Same Auth0 pages as web, but native

### **Implementation Benefits**
```swift
// Native WebView approach provides:
// 1. Full control over the authentication flow
// 2. Custom loading states and error handling
// 3. Seamless integration with app navigation
// 4. Better user experience than external browser
```

### **Alternative: Auth0 iOS SDK**
For even more native experience, consider using Auth0's iOS SDK:
- **Pros**: Fully native UI, better performance
- **Cons**: Requires custom UI implementation
- **Recommendation**: Start with WebView approach, migrate to SDK later

## 🎯 **Success Metrics**

- ✅ **Web client reference** - Fully working authentication
- ✅ **Backend stability** - Production ready with Auth0
- ✅ **API completeness** - All endpoints documented and working
- ✅ **Multi-arch support** - Docker images work on all platforms
- ✅ **Native iOS experience** - In-app authentication flow

## 🎓 **First Time User Experience (FTUE) - NEW**

### Educational Toast for "Watched" Items

**Context**: When users mark items as "watched", they may be confused when items disappear from their view (if the "Unwatched" filter is enabled). The web client now shows an educational toast the first time a user marks something as watched.

#### Web Implementation (Reference)
```javascript
// Check if user has seen the tip
if (!localStorage.getItem('hasSeenWatchedTip')) {
    // Show educational toast after marking item as watched
    showWatchedItemEducationTip();
}

// Toast shows:
// - "✅ Marked as watched!"
// - Explanation that items are still in the list
// - Two action buttons: "Got it" and "Show Me"
// - "Show Me" opens filter menu and highlights the "Unwatched" toggle
```

#### React Native Implementation for iOS

**Step 1: Track if user has seen the tip**
```javascript
// Use AsyncStorage to track FTUE state
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  HAS_SEEN_WATCHED_TIP: 'hasSeenWatchedTip'
};

// Check if user has seen the tip
const hasSeenWatchedTip = async () => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.HAS_SEEN_WATCHED_TIP);
    return value === 'true';
  } catch (error) {
    console.error('Error checking watched tip status:', error);
    return false;
  }
};

// Mark tip as seen
const markWatchedTipAsSeen = async () => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.HAS_SEEN_WATCHED_TIP, 'true');
  } catch (error) {
    console.error('Error saving watched tip status:', error);
  }
};
```

**Step 2: Show educational toast after toggling watched status**
```javascript
// In your toggleWatched function (after successful API call)
const toggleWatched = async (type, id) => {
  try {
    const response = await fetch(`${API_BASE}/watchlist/${type}/${id}/toggle`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      const result = await response.json();
      
      // Show educational tip if user just marked their first item as watched
      if (result.watched && !(await hasSeenWatchedTip())) {
        showWatchedItemEducationToast();
      }
      
      // Update UI...
    }
  } catch (error) {
    console.error('Error toggling watched status:', error);
  }
};
```

**Step 3: Create the educational toast component**
```javascript
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';

const showWatchedItemEducationToast = () => {
  // Create a custom toast or use a toast library
  // Toast should display:
  // 1. Icon: ✅
  // 2. Title: "Marked as watched!"
  // 3. Message: "Watched items are still in your list. Use the Filter button to show/hide them."
  // 4. Two buttons: "Got it" and "Show Me"
  
  // Example using a modal or overlay:
  const ToastContent = () => (
    <View style={styles.toastContainer}>
      <View style={styles.toastContent}>
        <Text style={styles.toastIcon}>✅</Text>
        <View style={styles.toastText}>
          <Text style={styles.toastTitle}>Marked as watched!</Text>
          <Text style={styles.toastMessage}>
            Watched items are still in your list. Use the Filter button to show/hide them.
          </Text>
        </View>
      </View>
      <View style={styles.toastActions}>
        <TouchableOpacity 
          style={styles.buttonSecondary}
          onPress={handleDismiss}
        >
          <Text style={styles.buttonTextSecondary}>Got it</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.buttonPrimary}
          onPress={handleShowMe}
        >
          <Text style={styles.buttonTextPrimary}>Show Me</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  
  const handleDismiss = async () => {
    await markWatchedTipAsSeen();
    // Hide toast with animation
  };
  
  const handleShowMe = async () => {
    await markWatchedTipAsSeen();
    // Hide toast
    // Navigate to filters screen or open filter modal
    // Highlight the "Unwatched" toggle (optional: add a pulse animation)
    navigation.navigate('Filters', { highlightUnwatched: true });
  };
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.98)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  toastContent: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  toastIcon: {
    fontSize: 24,
  },
  toastText: {
    flex: 1,
  },
  toastTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  toastMessage: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    lineHeight: 18,
  },
  toastActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  buttonSecondary: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonPrimary: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  buttonTextSecondary: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonTextPrimary: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
```

**Step 4: Highlight filter when "Show Me" is tapped**
```javascript
// In your Filter screen component
const FilterScreen = ({ route }) => {
  const { highlightUnwatched } = route.params || {};
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (highlightUnwatched) {
      // Pulse animation for the Unwatched filter toggle
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 3 }
      ).start();
    }
  }, [highlightUnwatched]);
  
  return (
    <View>
      {/* Other filters... */}
      
      <Animated.View 
        style={{
          transform: [{ scale: highlightUnwatched ? pulseAnim : 1 }],
          shadowColor: highlightUnwatched ? '#007AFF' : 'transparent',
          shadowOpacity: 0.5,
          shadowRadius: 8,
        }}
      >
        <FilterToggle 
          label="Unwatched Only" 
          value={filters.unwatched}
          onToggle={handleUnwatchedToggle}
        />
      </Animated.View>
    </View>
  );
};
```

### Key Implementation Notes for iOS
1. **Trigger**: Show toast ONLY the first time a user marks something as watched
2. **Storage**: Use `AsyncStorage` to persist the `hasSeenWatchedTip` flag
3. **Timing**: Show immediately after successful API response (when `result.watched === true`)
4. **Actions**:
   - **"Got it"**: Dismiss toast, mark as seen, user continues normally
   - **"Show Me"**: Dismiss toast, mark as seen, navigate to Filters screen with highlight
5. **Animation**: Use React Native's `Animated` API for smooth transitions
6. **Styling**: Match the dark theme of the app (see style example above)

### Default Filter State (Also NEW)
The default filter state has been updated in the web client:
- **`unwatched: false`** - Show BOTH watched and unwatched items by default
- This prevents the confusing behavior where new users mark items as watched and everything disappears

iOS should match this default:
```javascript
const DEFAULT_FILTERS = {
  movies: true,
  series: true,
  unwatched: false,  // Show ALL items by default
  runtime_under_30: true,
  runtime_30_60: true,
  runtime_60_90: true,
  runtime_over_90: true
};
```

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
