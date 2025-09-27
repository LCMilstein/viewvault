# Backend Mobile Authentication Fix Requirements

## 🎯 **Problem Summary**

The mobile app successfully authenticates with Auth0 and receives a JWT token from the mobile callback endpoint, but this token is inconsistently accepted by different API endpoints.

### **Current Status**
- ✅ **Working**: `/api/auth/me`, `/api/notifications/new-releases`
- ❌ **Failing**: `/api/lists`, `/api/watchlist` (returning 401 Unauthorized)

### **Impact**
The mobile app cannot load user data (lists, watchlist) after successful authentication, causing a poor user experience.

---

## 🔍 **Technical Details**

### **Authentication Flow**
1. Mobile app authenticates with Auth0 using Google OAuth
2. Auth0 returns access token to mobile app
3. Mobile app sends Auth0 access token to backend: `POST /api/auth/auth0/mobile-callback`
4. Backend returns JWT token for API access
5. Mobile app uses JWT token for subsequent API calls

### **Current Request/Response**

**Mobile Callback Request**:
```http
POST https://app.viewvault.app/api/auth/auth0/mobile-callback
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJkaXIiLCJl..."
}
```

**Mobile Callback Response** (Working):
```json
{
  "access_token": "jwt_token_for_api_access",
  "token_type": "bearer"
}
```

### **API Endpoint Status**

| Endpoint | Status | Response |
|----------|--------|----------|
| `POST /api/auth/auth0/mobile-callback` | ✅ Working | Returns JWT token |
| `GET /api/auth/me` | ✅ Working | Returns user profile |
| `GET /api/notifications/new-releases` | ✅ Working | Returns notifications |
| `GET /api/lists` | ❌ **FAILING** | Returns 401 Unauthorized |
| `GET /api/watchlist` | ❌ **FAILING** | Returns 401 Unauthorized |

---

## 🛠️ **Required Backend Changes**

### **1. JWT Token Validation Consistency**
**Issue**: The JWT token returned by `/api/auth/auth0/mobile-callback` is not accepted by all authenticated endpoints.

**Required**: Ensure all authenticated endpoints accept the same JWT token format and validation logic.

### **2. Mobile Authentication Scope**
**Issue**: The mobile callback endpoint may be returning a JWT token with insufficient permissions/scope.

**Required**: Verify that the JWT token includes all necessary permissions for:
- Reading user lists (`/api/lists`)
- Reading user watchlist (`/api/watchlist`)
- Reading user profile (`/api/auth/me`) - already working
- Reading notifications (`/api/notifications/new-releases`) - already working

### **3. Endpoint Authentication Middleware**
**Issue**: Different endpoints may be using different authentication middleware or validation logic.

**Required**: Ensure all authenticated endpoints use consistent JWT validation.

---

## 🧪 **Testing Requirements**

### **Test Case 1: Mobile Callback Token Validation**
1. Call `POST /api/auth/auth0/mobile-callback` with valid Auth0 token
2. Extract the returned JWT token
3. Test this JWT token against ALL authenticated endpoints:

```bash
# Should all return 200 OK with the same JWT token
curl -H "Authorization: Bearer <jwt_token>" https://app.viewvault.app/api/auth/me
curl -H "Authorization: Bearer <jwt_token>" https://app.viewvault.app/api/lists
curl -H "Authorization: Bearer <jwt_token>" https://app.viewvault.app/api/watchlist
curl -H "Authorization: Bearer <jwt_token>" https://app.viewvault.app/api/notifications/new-releases
```

### **Test Case 2: JWT Token Structure**
Verify the JWT token returned by mobile callback:
1. Is properly signed
2. Contains correct user information
3. Has appropriate expiration time
4. Includes necessary claims/permissions

---

## 📱 **Mobile App Configuration**

### **Auth0 Configuration**
- **Domain**: `dev-a6z1zwjm1wj3xpjg.us.auth0.com`
- **Mobile Client ID**: `LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx`
- **Audience**: `https://api.viewvault.app`
- **Scheme**: `com.leemilstein.viewvault`

### **Backend URL**
- **Production**: `https://app.viewvault.app`

---

## 🔧 **Potential Root Causes**

1. **JWT Token Format**: Mobile callback returning different JWT format than expected
2. **Authentication Middleware**: Different endpoints using different auth middleware
3. **Token Scope/Permissions**: JWT token missing required permissions
4. **User Context**: JWT token not properly linking to user in database
5. **Token Validation Logic**: Inconsistent validation between endpoints

---

## ✅ **Success Criteria**

After the fix:
1. Mobile app authenticates with Auth0 ✅
2. Mobile callback returns valid JWT token ✅
3. **ALL** authenticated endpoints accept the JWT token ✅
4. Mobile app can load user lists and watchlist data ✅
5. No 401 Unauthorized errors on authenticated endpoints ✅

---

## 📞 **Contact Information**

**Mobile App Developer**: Available for testing and verification once backend changes are deployed.

**Environment**: Production backend at `https://app.viewvault.app`

**Priority**: High - Mobile app users cannot access their data after authentication.

---

## 📋 **Action Items**

- [ ] Investigate JWT token validation inconsistency between endpoints
- [ ] Verify mobile callback endpoint returns properly scoped JWT token
- [ ] Test all authenticated endpoints with mobile callback JWT token
- [ ] Deploy fix to production backend
- [ ] Verify mobile app works end-to-end after deployment
