# Mobile Auth0 Implementation Guide

## Overview
The backend now supports both web and mobile Auth0 applications, allowing the iOS app to authenticate using the same Auth0 domain and audience as the web application.

## Implementation Summary

### ✅ Changes Made

1. **Fixed Audience URL**: The audience URL format is correct (`https://api.viewvault.app`)
2. **Dual Client ID Support**: Backend now supports both web and mobile Auth0 applications
3. **New Mobile Endpoint**: Added `/api/auth/auth0/mobile-callback` for mobile authentication
4. **Backward Compatibility**: Existing web authentication continues to work unchanged

### 🔧 Environment Variables

The following environment variables are now supported:

```bash
# Required
AUTH0_DOMAIN=dev-a6z1zwjm1wj3xpjg.us.auth0.com
AUTH0_WEB_CLIENT_ID=6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw
AUTH0_MOBILE_CLIENT_ID=LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_AUDIENCE=https://api.viewvault.app

# Legacy support (for backward compatibility)
AUTH0_CLIENT_ID=6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw
```

### 📱 Mobile Authentication Flow

The mobile app should use the new endpoint:

**Endpoint**: `POST /api/auth/auth0/mobile-callback`

**Request Body**:
```json
{
  "access_token": "eyJhbGciOiJkaXIiLCJl..."
}
```

**Response**:
```json
{
  "access_token": "jwt_token_for_api_access",
  "token_type": "bearer"
}
```

### 🌐 Web Authentication Flow (Unchanged)

The web application continues to use the existing flow:

1. **Get Config**: `GET /api/auth/auth0/config`
2. **Initiate OAuth**: `GET /api/auth/auth0/oauth/{provider}`
3. **Handle Callback**: `POST /api/auth/auth0/callback`

### 🔐 Token Validation

The backend now validates tokens from both client IDs:
- **Web Client ID**: `6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw`
- **Mobile Client ID**: `LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx`

Both applications use:
- **Same Domain**: `dev-a6z1zwjm1wj3xpjg.us.auth0.com`
- **Same Audience**: `https://api.viewvault.app`

### 🧪 Testing

After deployment, verify:

1. **Web Authentication Still Works**:
   - Google login via web
   - GitHub login via web
   - Email/password login

2. **Mobile Authentication Works**:
   - Google login via mobile app
   - GitHub login via mobile app
   - Direct access token validation

### 🚀 Deployment

1. **Update Environment Variables**: Set the new `AUTH0_WEB_CLIENT_ID` and `AUTH0_MOBILE_CLIENT_ID` variables
2. **Deploy Backend**: The changes are backward compatible
3. **Test Both Flows**: Verify web and mobile authentication work

### 📋 API Endpoints

| Endpoint | Method | Purpose | Client |
|----------|--------|---------|---------|
| `/api/auth/auth0/config` | GET | Get Auth0 config | Web |
| `/api/auth/auth0/oauth/{provider}` | GET | Initiate OAuth | Web |
| `/api/auth/auth0/callback` | POST | Handle web callback | Web |
| `/api/auth/auth0/mobile-callback` | POST | Handle mobile callback | Mobile |

### 🔍 Debugging

If authentication fails, check the logs for:
- `AUTH0 DEBUG` messages showing configuration
- Token validation errors
- Client ID validation messages

### 📞 Support

The implementation follows the mobile team's specifications exactly:
- ✅ Fixed audience URL format
- ✅ Support for both client IDs
- ✅ New mobile callback endpoint
- ✅ Backward compatibility maintained
- ✅ No breaking changes to existing functionality
