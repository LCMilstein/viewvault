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

### List Item Copy/Move Operations (NEW)
- `POST /api/lists/{source_list_id}/items/{item_id}/copy` - Copy item to another list
- `POST /api/lists/{source_list_id}/items/{item_id}/move` - Move item to another list
- `GET /api/lists/{source_list_id}/available-targets` - Get available target lists
- `POST /api/lists/bulk-operation` - Bulk copy/move multiple items

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

## 📋 **List Item Copy/Move Feature - NEW**

### Overview
The backend now supports copying and moving items between lists, including support for collections and series expansion. This feature allows users to reorganize their watchlist efficiently without manually re-adding items.

### Key Features
- **Copy items** - Duplicate items to another list while keeping the original
- **Move items** - Transfer items to another list and remove from source
- **Duplicate detection** - Intelligent handling of items that already exist in target list
- **Collection expansion** - Automatically copy/move all movies in a collection
- **Series expansion** - Automatically copy/move series with all episodes
- **Bulk operations** - Copy/move multiple items in a single transaction
- **Metadata preservation** - Optionally preserve watched status and notes

---

### API Endpoint: Copy Item to List

**Endpoint:** `POST /api/lists/{source_list_id}/items/{item_id}/copy`

**Description:** Copies a single item from one list to another. If the item is a collection or series, all related items are copied together.

**Request Body:**
```json
{
  "target_list_id": 123,
  "item_type": "movie",
  "preserve_metadata": true
}
```

**Parameters:**
- `source_list_id` (path) - ID of the list containing the item
- `item_id` (path) - ID of the item to copy
- `target_list_id` (body) - ID of the destination list
- `item_type` (body) - Type of item: `"movie"`, `"series"`, or `"collection"`
- `preserve_metadata` (body, optional) - Whether to preserve watched status and notes (default: `true`)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Item copied to 'Some Day' list",
  "duplicate": false,
  "items_affected": 1
}
```

**Duplicate Warning Response (409):**
```json
{
  "success": false,
  "message": "Item already exists in target list",
  "duplicate": true,
  "items_affected": 0
}
```

**Error Response (403/404/500):**
```json
{
  "detail": "Access denied to target list"
}
```

**iOS Implementation Example:**
```swift
struct CopyItemRequest: Codable {
    let target_list_id: Int
    let item_type: String
    let preserve_metadata: Bool
}

struct CopyItemResponse: Codable {
    let success: Bool
    let message: String
    let duplicate: Bool
    let items_affected: Int
}

func copyItem(sourceListId: Int, itemId: Int, targetListId: Int, itemType: String) async throws -> CopyItemResponse {
    let url = URL(string: "\(APIConfig.baseURL)/api/lists/\(sourceListId)/items/\(itemId)/copy")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(getAuthToken())", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let requestBody = CopyItemRequest(
        target_list_id: targetListId,
        item_type: itemType,
        preserve_metadata: true
    )
    request.httpBody = try JSONEncoder().encode(requestBody)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse
    }
    
    if httpResponse.statusCode == 409 {
        // Handle duplicate - show warning to user
        let duplicateResponse = try JSONDecoder().decode(CopyItemResponse.self, from: data)
        throw APIError.duplicate(duplicateResponse.message)
    }
    
    guard httpResponse.statusCode == 200 else {
        throw APIError.httpError(httpResponse.statusCode)
    }
    
    return try JSONDecoder().decode(CopyItemResponse.self, from: data)
}
```

---

### API Endpoint: Move Item to List

**Endpoint:** `POST /api/lists/{source_list_id}/items/{item_id}/move`

**Description:** Moves a single item from one list to another. The item is removed from the source list and added to the target list. If the item is a collection or series, all related items are moved together.

**Request Body:**
```json
{
  "target_list_id": 123,
  "item_type": "movie"
}
```

**Parameters:**
- `source_list_id` (path) - ID of the list containing the item
- `item_id` (path) - ID of the item to move
- `target_list_id` (body) - ID of the destination list
- `item_type` (body) - Type of item: `"movie"`, `"series"`, or `"collection"`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Item moved to 'Some Day' list",
  "duplicate": false,
  "items_affected": 1
}
```

**Duplicate Warning Response (409):**
```json
{
  "success": false,
  "message": "Item already exists in target list. Remove from source?",
  "duplicate": true,
  "items_affected": 0
}
```

**iOS Implementation Example:**
```swift
struct MoveItemRequest: Codable {
    let target_list_id: Int
    let item_type: String
}

func moveItem(sourceListId: Int, itemId: Int, targetListId: Int, itemType: String) async throws -> CopyItemResponse {
    let url = URL(string: "\(APIConfig.baseURL)/api/lists/\(sourceListId)/items/\(itemId)/move")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(getAuthToken())", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let requestBody = MoveItemRequest(
        target_list_id: targetListId,
        item_type: itemType
    )
    request.httpBody = try JSONEncoder().encode(requestBody)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse
    }
    
    if httpResponse.statusCode == 409 {
        // Handle duplicate - offer to remove from source only
        let duplicateResponse = try JSONDecoder().decode(CopyItemResponse.self, from: data)
        
        // Show alert with options:
        // 1. "Remove from Source Only" - delete from source list
        // 2. "Cancel" - abort operation
        throw APIError.duplicate(duplicateResponse.message)
    }
    
    guard httpResponse.statusCode == 200 else {
        throw APIError.httpError(httpResponse.statusCode)
    }
    
    return try JSONDecoder().decode(CopyItemResponse.self, from: data)
}
```

---

### API Endpoint: Get Available Target Lists

**Endpoint:** `GET /api/lists/{source_list_id}/available-targets`

**Description:** Returns all lists that can be used as targets for copy/move operations. Excludes the source list and includes only lists the user owns or has edit permission on.

**Parameters:**
- `source_list_id` (path) - ID of the source list

**Success Response (200):**
```json
{
  "lists": [
    {
      "id": 123,
      "name": "Some Day",
      "icon": "📅",
      "color": "#FF6B6B",
      "item_count": 15
    },
    {
      "id": 124,
      "name": "Family Movies",
      "icon": "👨‍👩‍👧‍👦",
      "color": "#4ECDC4",
      "item_count": 8
    }
  ]
}
```

**iOS Implementation Example:**
```swift
struct TargetList: Codable, Identifiable {
    let id: Int
    let name: String
    let icon: String
    let color: String
    let item_count: Int
}

struct AvailableTargetsResponse: Codable {
    let lists: [TargetList]
}

func getAvailableTargetLists(sourceListId: Int) async throws -> [TargetList] {
    let url = URL(string: "\(APIConfig.baseURL)/api/lists/\(sourceListId)/available-targets")!
    var request = URLRequest(url: url)
    request.setValue("Bearer \(getAuthToken())", forHTTPHeaderField: "Authorization")
    
    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(AvailableTargetsResponse.self, from: data)
    
    return response.lists
}
```

---

### API Endpoint: Bulk Copy/Move Operations

**Endpoint:** `POST /api/lists/bulk-operation`

**Description:** Copies or moves multiple items in a single transaction. All operations succeed or fail together. Supports mixed item types (movies, series, collections).

**Request Body:**
```json
{
  "operation": "copy",
  "source_list_id": 1,
  "target_list_id": 123,
  "items": [
    {"item_id": 45, "item_type": "movie"},
    {"item_id": 67, "item_type": "series"},
    {"item_id": 89, "item_type": "collection"}
  ]
}
```

**Parameters:**
- `operation` (body) - Operation type: `"copy"` or `"move"`
- `source_list_id` (body) - ID of the source list
- `target_list_id` (body) - ID of the destination list
- `items` (body) - Array of items to copy/move

**Success Response (200):**
```json
{
  "success": true,
  "message": "5 items copied to 'Some Day' list",
  "items_affected": 5,
  "duplicates_skipped": 2,
  "errors": []
}
```

**Partial Success Response (200):**
```json
{
  "success": true,
  "message": "3 of 5 items copied to 'Some Day' list",
  "items_affected": 3,
  "duplicates_skipped": 1,
  "errors": [
    {"item_id": 67, "item_type": "series", "error": "Item not found"}
  ]
}
```

**iOS Implementation Example:**
```swift
struct BulkOperationItem: Codable {
    let item_id: Int
    let item_type: String
}

struct BulkOperationRequest: Codable {
    let operation: String
    let source_list_id: Int
    let target_list_id: Int
    let items: [BulkOperationItem]
}

struct BulkOperationError: Codable {
    let item_id: Int
    let item_type: String
    let error: String
}

struct BulkOperationResponse: Codable {
    let success: Bool
    let message: String
    let items_affected: Int
    let duplicates_skipped: Int
    let errors: [BulkOperationError]
}

func bulkCopyItems(sourceListId: Int, targetListId: Int, items: [BulkOperationItem]) async throws -> BulkOperationResponse {
    let url = URL(string: "\(APIConfig.baseURL)/api/lists/bulk-operation")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(getAuthToken())", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let requestBody = BulkOperationRequest(
        operation: "copy",
        source_list_id: sourceListId,
        target_list_id: targetListId,
        items: items
    )
    request.httpBody = try JSONEncoder().encode(requestBody)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
        throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 500)
    }
    
    return try JSONDecoder().decode(BulkOperationResponse.self, from: data)
}

func bulkMoveItems(sourceListId: Int, targetListId: Int, items: [BulkOperationItem]) async throws -> BulkOperationResponse {
    let url = URL(string: "\(APIConfig.baseURL)/api/lists/bulk-operation")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(getAuthToken())", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let requestBody = BulkOperationRequest(
        operation: "move",
        source_list_id: sourceListId,
        target_list_id: targetListId,
        items: items
    )
    request.httpBody = try JSONEncoder().encode(requestBody)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
        throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 500)
    }
    
    return try JSONDecoder().decode(BulkOperationResponse.self, from: data)
}
```

---

### Duplicate Handling Behavior

When copying or moving items, the backend checks if the item already exists in the target list:

**For Copy Operations:**
- If duplicate exists: Return HTTP 409 with warning message
- User options:
  1. **Cancel** - Abort the operation
  2. **Skip** - Continue without copying (for bulk operations)

**For Move Operations:**
- If duplicate exists: Return HTTP 409 with warning message
- User options:
  1. **Cancel** - Abort the operation
  2. **Remove from Source Only** - Delete from source list, keep in target

**iOS Implementation Pattern:**
```swift
do {
    let result = try await copyItem(
        sourceListId: sourceList.id,
        itemId: item.id,
        targetListId: targetList.id,
        itemType: item.type
    )
    
    // Show success message
    showAlert(title: "Success", message: result.message)
    
} catch APIError.duplicate(let message) {
    // Show duplicate warning with options
    let alert = UIAlertController(
        title: "Item Already Exists",
        message: message,
        preferredStyle: .alert
    )
    
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    
    if operation == .move {
        alert.addAction(UIAlertAction(title: "Remove from Source Only", style: .default) { _ in
            // Delete item from source list
            Task {
                try await deleteItem(listId: sourceList.id, itemId: item.id)
            }
        })
    }
    
    present(alert, animated: true)
    
} catch {
    // Handle other errors
    showAlert(title: "Error", message: error.localizedDescription)
}
```

---

### Collection and Series Expansion

When copying or moving collections or series, the backend automatically expands them to include all related items:

**Collections:**
- Copying a collection copies all movies in that collection
- Moving a collection moves all movies in that collection
- `items_affected` in response indicates total number of movies

**Series:**
- Copying a series copies the series entry and all episodes
- Moving a series moves the series entry and all episodes
- Episode watched status is preserved
- `items_affected` in response indicates series + all episodes

**Example Response for Collection:**
```json
{
  "success": true,
  "message": "Collection 'The Lord of the Rings' copied to 'Some Day' list",
  "duplicate": false,
  "items_affected": 3
}
```

**iOS Implementation Notes:**
- No special handling required - backend handles expansion automatically
- Display `items_affected` count to user to show how many items were copied/moved
- For collections/series, show a more detailed message: "Copied 3 movies from collection"

---

### iOS UI Implementation Guide

#### 1. List Selector View

Create a native list picker to select target lists:

```swift
struct ListSelectorView: View {
    let sourceListId: Int
    let operation: Operation // .copy or .move
    let onSelect: (TargetList) -> Void
    
    @State private var availableLists: [TargetList] = []
    @State private var isLoading = true
    
    enum Operation {
        case copy
        case move
        
        var title: String {
            switch self {
            case .copy: return "Copy to List"
            case .move: return "Move to List"
            }
        }
    }
    
    var body: some View {
        NavigationView {
            List {
                if isLoading {
                    ProgressView()
                } else {
                    ForEach(availableLists) { list in
                        Button(action: { onSelect(list) }) {
                            HStack {
                                Text(list.icon)
                                    .font(.title2)
                                
                                VStack(alignment: .leading) {
                                    Text(list.name)
                                        .font(.headline)
                                    Text("\(list.item_count) items")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                
                                Spacer()
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    
                    Button(action: { /* Create new list */ }) {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                            Text("Create New List")
                        }
                        .foregroundColor(.blue)
                    }
                }
            }
            .navigationTitle(operation.title)
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await loadAvailableLists()
            }
        }
    }
    
    func loadAvailableLists() async {
        do {
            availableLists = try await getAvailableTargetLists(sourceListId: sourceListId)
            isLoading = false
        } catch {
            // Handle error
            isLoading = false
        }
    }
}
```

#### 2. Item Context Menu

Add copy/move actions to item swipe actions or context menu:

```swift
struct ListItemRow: View {
    let item: ListItem
    let listId: Int
    
    @State private var showingListSelector = false
    @State private var selectedOperation: ListSelectorView.Operation?
    
    var body: some View {
        HStack {
            // Item content...
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button {
                selectedOperation = .move
                showingListSelector = true
            } label: {
                Label("Move", systemImage: "arrow.right")
            }
            .tint(.blue)
            
            Button {
                selectedOperation = .copy
                showingListSelector = true
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }
            .tint(.green)
        }
        .sheet(isPresented: $showingListSelector) {
            if let operation = selectedOperation {
                ListSelectorView(
                    sourceListId: listId,
                    operation: operation
                ) { targetList in
                    Task {
                        await performOperation(operation, targetList: targetList)
                    }
                    showingListSelector = false
                }
            }
        }
    }
    
    func performOperation(_ operation: ListSelectorView.Operation, targetList: TargetList) async {
        do {
            let result: CopyItemResponse
            
            switch operation {
            case .copy:
                result = try await copyItem(
                    sourceListId: listId,
                    itemId: item.id,
                    targetListId: targetList.id,
                    itemType: item.type
                )
            case .move:
                result = try await moveItem(
                    sourceListId: listId,
                    itemId: item.id,
                    targetListId: targetList.id,
                    itemType: item.type
                )
            }
            
            // Show success message
            showToast(result.message)
            
        } catch APIError.duplicate(let message) {
            // Handle duplicate
            showDuplicateAlert(message: message, operation: operation)
        } catch {
            // Handle error
            showToast("Operation failed: \(error.localizedDescription)")
        }
    }
}
```

#### 3. Bulk Selection Mode

Implement multi-select for bulk operations:

```swift
struct ListView: View {
    @State private var items: [ListItem] = []
    @State private var selectedItems: Set<Int> = []
    @State private var isSelectionMode = false
    @State private var showingBulkListSelector = false
    @State private var bulkOperation: ListSelectorView.Operation?
    
    var body: some View {
        List {
            ForEach(items) { item in
                HStack {
                    if isSelectionMode {
                        Image(systemName: selectedItems.contains(item.id) ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(.blue)
                            .onTapGesture {
                                toggleSelection(item.id)
                            }
                    }
                    
                    ListItemRow(item: item, listId: currentListId)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(isSelectionMode ? "Cancel" : "Select") {
                    isSelectionMode.toggle()
                    if !isSelectionMode {
                        selectedItems.removeAll()
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if isSelectionMode && !selectedItems.isEmpty {
                BulkActionBar(
                    selectedCount: selectedItems.count,
                    onCopy: {
                        bulkOperation = .copy
                        showingBulkListSelector = true
                    },
                    onMove: {
                        bulkOperation = .move
                        showingBulkListSelector = true
                    }
                )
            }
        }
        .sheet(isPresented: $showingBulkListSelector) {
            if let operation = bulkOperation {
                ListSelectorView(
                    sourceListId: currentListId,
                    operation: operation
                ) { targetList in
                    Task {
                        await performBulkOperation(operation, targetList: targetList)
                    }
                    showingBulkListSelector = false
                }
            }
        }
    }
    
    func toggleSelection(_ itemId: Int) {
        if selectedItems.contains(itemId) {
            selectedItems.remove(itemId)
        } else {
            selectedItems.insert(itemId)
        }
    }
    
    func performBulkOperation(_ operation: ListSelectorView.Operation, targetList: TargetList) async {
        let bulkItems = items
            .filter { selectedItems.contains($0.id) }
            .map { BulkOperationItem(item_id: $0.id, item_type: $0.type) }
        
        do {
            let result: BulkOperationResponse
            
            switch operation {
            case .copy:
                result = try await bulkCopyItems(
                    sourceListId: currentListId,
                    targetListId: targetList.id,
                    items: bulkItems
                )
            case .move:
                result = try await bulkMoveItems(
                    sourceListId: currentListId,
                    targetListId: targetList.id,
                    items: bulkItems
                )
            }
            
            // Show detailed result
            var message = result.message
            if result.duplicates_skipped > 0 {
                message += "\n\(result.duplicates_skipped) duplicates skipped"
            }
            if !result.errors.isEmpty {
                message += "\n\(result.errors.count) items failed"
            }
            
            showToast(message)
            
            // Exit selection mode
            isSelectionMode = false
            selectedItems.removeAll()
            
            // Refresh list
            await loadItems()
            
        } catch {
            showToast("Bulk operation failed: \(error.localizedDescription)")
        }
    }
}

struct BulkActionBar: View {
    let selectedCount: Int
    let onCopy: () -> Void
    let onMove: () -> Void
    
    var body: some View {
        HStack {
            Text("\(selectedCount) selected")
                .font(.headline)
            
            Spacer()
            
            Button(action: onCopy) {
                Label("Copy", systemImage: "doc.on.doc")
            }
            .buttonStyle(.bordered)
            
            Button(action: onMove) {
                Label("Move", systemImage: "arrow.right")
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .background(.ultraThinMaterial)
    }
}
```

---

### Breaking Changes

**None.** All new endpoints are additive and do not modify existing API behavior. The iOS app can continue to use existing endpoints without any changes. The copy/move functionality is entirely optional and can be implemented incrementally.

### Migration Notes

1. **Existing functionality unchanged** - All current list management endpoints work exactly as before
2. **Backward compatible** - Older iOS app versions will continue to work without issues
3. **Opt-in feature** - Copy/move functionality can be added to iOS app at any time
4. **No database migrations required** - Uses existing data structures

---

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
