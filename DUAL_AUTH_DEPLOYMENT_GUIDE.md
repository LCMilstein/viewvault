# Dual Authentication Deployment Guide

## Overview
This implementation provides dual authentication support:
- **JWT Authentication**: Preserved for iOS client compatibility (all 103 API endpoints)
- **Supabase Authentication**: New OAuth support for web frontend (Google, GitHub, Email)

## What's New

### New Files
- `supabase_bridge.py` - Bridges Supabase auth to JWT system
- `static/auth-login.html` - Modern OAuth login page
- Updated `main.py` - Added Supabase auth routes
- Updated `requirements.txt` - Added Supabase dependency
- Updated `secrets.env.example` - Added Supabase configuration

### New API Endpoints
- `GET /api/auth/supabase/config` - Get Supabase configuration
- `POST /api/auth/supabase/oauth/{provider}` - Initiate OAuth login
- `POST /api/auth/supabase/callback` - Handle OAuth callback
- `POST /api/auth/supabase/email/login` - Email login via Supabase
- `POST /api/auth/supabase/email/register` - Email registration via Supabase

### New Web Routes
- `GET /auth` - Modern OAuth login page
- `GET /auth/callback` - OAuth callback handler

### Preserved Routes
- `GET /login` - Original JWT login page (iOS compatible)
- All existing API endpoints (103 total) - iOS compatible

## Deployment Instructions

### Step 1: Update Portainer Stack

1. **In Portainer, go to your stack**
2. **Click "Editor"**
3. **Change the image name to:**
   - `lcmilstein/viewvault:dual-auth`

### Step 2: Add Environment Variables (Optional)

If you want OAuth support, add these environment variables to your Portainer stack:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**Note**: If you don't add these variables, the system will work with JWT authentication only (iOS compatible).

### Step 3: Recreate the Container

1. **In Portainer, go to your container**
2. **Click "Recreate"** (this will pull the latest image)

### Step 4: Test the Implementation

#### Test JWT Authentication (iOS Compatible)
1. **Visit**: `https://app.viewvault.app/login`
2. **Test**: Username/password login and registration
3. **Verify**: All existing functionality works

#### Test OAuth Authentication (Web Only)
1. **Visit**: `https://app.viewvault.app/auth`
2. **Test**: OAuth buttons (if Supabase configured)
3. **Test**: Email authentication (if Supabase configured)
4. **Test**: Fallback to JWT authentication

## Authentication Flow

### For iOS Clients (No Changes Required)
1. Use existing JWT endpoints (`/api/auth/login`, `/api/auth/register`)
2. Include JWT token in `Authorization: Bearer <token>` header
3. All 103 API endpoints work exactly as before

### For Web Users (New OAuth Support)
1. Visit `/auth` for modern OAuth login
2. Choose authentication method:
   - **Google OAuth**: Click "Continue with Google"
   - **GitHub OAuth**: Click "Continue with GitHub"
   - **Email**: Click "Continue with Email"
   - **Traditional**: Click "Use Traditional Login" (JWT)
3. System automatically creates JWT token for API compatibility

## Configuration Options

### Option 1: JWT Only (Current Setup)
- No environment variables needed
- iOS client works without changes
- Web users use traditional login

### Option 2: Dual Authentication (Recommended)
- Add Supabase environment variables
- iOS client continues to work
- Web users get OAuth options

### Option 3: Supabase Only (Future)
- Migrate iOS client to use Supabase
- Remove JWT system
- Single authentication system

## Troubleshooting

### If OAuth Buttons Don't Work
- Check Supabase environment variables are set
- Verify Supabase project is configured
- Check browser console for errors

### If iOS Client Stops Working
- This should not happen - JWT system is preserved
- Check that `/api/auth/login` and `/api/auth/register` still work
- Verify JWT tokens are being generated

### If Web Login Fails
- Try the traditional login at `/login`
- Check that Supabase is properly configured
- Verify OAuth providers are set up in Supabase

## Testing Checklist

### JWT Authentication (iOS Compatible)
- [ ] `/api/auth/login` works
- [ ] `/api/auth/register` works
- [ ] `/api/auth/me` works
- [ ] All API endpoints work with JWT token
- [ ] Admin functions work
- [ ] User management works

### Supabase Authentication (Web Only)
- [ ] `/api/auth/supabase/config` returns configuration
- [ ] OAuth buttons appear (if configured)
- [ ] Email authentication works (if configured)
- [ ] OAuth callback works
- [ ] JWT tokens are generated for Supabase users

### Integration
- [ ] Both auth systems work together
- [ ] User data syncs correctly
- [ ] No conflicts between systems
- [ ] Error handling works

## Rollback Plan

If issues occur, you can easily rollback:

1. **Change image back to**: `lcmilstein/viewvault:latest` (previous version)
2. **Recreate container**
3. **System returns to JWT-only authentication**

## Next Steps

1. **Deploy and test** the dual authentication system
2. **Verify iOS compatibility** is maintained
3. **Test OAuth functionality** (if configured)
4. **Monitor for any issues**
5. **Consider iOS client migration** to Supabase (future)

## Support

- **JWT Issues**: Check existing authentication system
- **OAuth Issues**: Check Supabase configuration
- **Integration Issues**: Check user bridge system
- **iOS Issues**: Should not occur - JWT system preserved
