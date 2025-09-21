# Backend Auth0 Configuration Request

## Issue
The mobile iOS app cannot authenticate because the backend only supports the web Auth0 application. We need the backend to support both the web and native Auth0 applications.

## Current Backend Configuration
The backend currently returns this Auth0 config:
```json
{
  "domain": "dev-a6z1zwjm1wj3xpjg.us.auth0.com",
  "client_id": "6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw",
  "audience": "https//api.viewvault.app"  // Missing colon after https
}
```

## Required Changes

### 1. Fix Audience URL (Critical)
The audience URL is missing a colon. Change:
```
"audience": "https//api.viewvault.app"
```
To:
```
"audience": "https://api.viewvault.app"
```

### 2. Support Multiple Auth0 Applications
The backend needs to accept tokens from both Auth0 applications:

**Web Application:**
- Client ID: `6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw`
- Type: Single Page Application

**Native/Mobile Application:**
- Client ID: `LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx`
- Type: Native Application

### 3. Implementation Options

#### Option A: Update Token Validation (Recommended)
Modify the Auth0 token validation to accept tokens from both client IDs:
- Both applications use the same Auth0 domain: `dev-a6z1zwjm1wj3xpjg.us.auth0.com`
- Both applications use the same audience: `https://api.viewvault.app`
- The backend should validate tokens from either client ID

#### Option B: Separate Endpoints (Not Recommended)
Create separate endpoints for web vs mobile (more complex, not needed)

### 4. Environment Variables
Ensure these environment variables are set correctly:
```
AUTH0_DOMAIN=dev-a6z1zwjm1wj3xpjg.us.auth0.com
AUTH0_WEB_CLIENT_ID=6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw
AUTH0_MOBILE_CLIENT_ID=LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx
AUTH0_AUDIENCE=https://api.viewvault.app
```

### 5. Testing
After implementation, test that:
- Web authentication still works (existing functionality)
- Mobile authentication works with Google login
- Mobile authentication works with GitHub login
- Traditional email/password login still works

## Technical Details

The mobile app sends a POST request to `/api/auth/auth0/callback` with:
```json
{
  "access_token": "eyJhbGciOiJkaXIiLCJl..."
}
```

The backend should:
1. Validate the access token against Auth0
2. Extract user information from the token
3. Create or update the user in the database
4. Return a JWT token for API access

## Priority
High - Mobile app cannot authenticate without this fix.

## Impact
- ✅ Web authentication continues to work
- ✅ Mobile authentication starts working
- ✅ No breaking changes to existing API