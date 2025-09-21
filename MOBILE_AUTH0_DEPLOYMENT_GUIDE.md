# Mobile Auth0 Deployment Guide

## ✅ Status: Ready for Deployment

The mobile team is **100% correct** - the changes need to be deployed to production. The local code changes are complete, but the production server is still running the old code.

## 🚨 Critical Issues Found by Mobile Team

1. **❌ Missing Colon in Audience URL**: Production still returns `https//api.viewvault.app` (missing colon)
2. **❌ Mobile Endpoint Missing**: `/api/auth/auth0/mobile-callback` returns 404 Not Found
3. **❌ Old Code Deployed**: Production is running old code without mobile support

## 🛠️ Deployment Steps

### Step 1: Update Environment Variables

The production environment needs these new variables:

```bash
# Add these to your production environment
AUTH0_WEB_CLIENT_ID=6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw
AUTH0_MOBILE_CLIENT_ID=LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx

# Keep existing variables
AUTH0_DOMAIN=dev-a6z1zwjm1wj3xpjg.us.auth0.com
AUTH0_CLIENT_ID=6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw  # For backward compatibility
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_AUDIENCE=https://api.viewvault.app
```

### Step 2: Deploy Updated Code

The new Docker image `viewvault:mobile-auth0-20250921-161055` has been built with:
- ✅ Fixed audience URL format
- ✅ Mobile callback endpoint `/api/auth/auth0/mobile-callback`
- ✅ Support for both web and mobile client IDs
- ✅ Backward compatibility maintained

### Step 3: Update Portainer Stack

The `portainer-stack.yml` has been updated to use the new image. Deploy it using your Portainer interface.

### Step 4: Verify Deployment

After deployment, run these tests:

```bash
# 1. Check mobile endpoint exists
curl -s https://app.viewvault.app/openapi.json | grep "mobile-callback"
# Should return: "/api/auth/auth0/mobile-callback"

# 2. Check audience URL is fixed
curl -s https://app.viewvault.app/api/auth/auth0/config
# Should return: {"audience":"https://api.viewvault.app"}  # With colon!

# 3. Test mobile endpoint (should return 400/401, not 404)
curl -X POST https://app.viewvault.app/api/auth/auth0/mobile-callback \
  -H "Content-Type: application/json" \
  -d '{"access_token":"test"}'
# Should return: 400 or 401 (not 404 or 500)
```

## 🔧 What Was Fixed

### Code Changes Made:
1. **Auth0Bridge Updates**: Now supports both `AUTH0_WEB_CLIENT_ID` and `AUTH0_MOBILE_CLIENT_ID`
2. **Mobile Endpoint**: Added `POST /api/auth/auth0/mobile-callback`
3. **Token Validation**: Validates tokens from both client IDs
4. **Backward Compatibility**: Existing web auth continues to work

### Files Modified:
- `auth0_bridge.py` - Added mobile support
- `main.py` - Added mobile callback endpoint
- `portainer-stack.yml` - Updated image and environment variables
- `secrets.env.example` - Added new environment variables

## 🚀 Deployment Commands

If you're using Docker Compose locally:

```bash
# Stop current container
docker-compose down

# Update the image in docker-compose.yml
# Change: image: lcmilstein/viewvault:auth0-fixed-redirect-20250921-132242
# To: image: viewvault:mobile-auth0-20250921-161055

# Start with new image
docker-compose up -d
```

If you're using Portainer:

1. Update the stack with the new `portainer-stack.yml`
2. Add the new environment variables
3. Deploy the updated stack

## ✅ Expected Results After Deployment

1. **Mobile Endpoint**: `/api/auth/auth0/mobile-callback` will exist
2. **Fixed Audience URL**: Will return `https://api.viewvault.app` (with colon)
3. **Web Auth Still Works**: Existing web authentication unchanged
4. **Mobile Auth Works**: iOS app can authenticate

## 🆘 If Issues Persist

If the mobile team still gets 404 errors after deployment:

1. **Check Environment Variables**: Ensure `AUTH0_WEB_CLIENT_ID` and `AUTH0_MOBILE_CLIENT_ID` are set
2. **Check Container Logs**: Look for Auth0 configuration errors
3. **Verify Image**: Ensure the new image is actually running
4. **Test Locally**: Run the new image locally to verify it works

## 📞 Next Steps

1. **Deploy the changes** using the updated `portainer-stack.yml`
2. **Add the environment variables** to your production environment
3. **Test the mobile endpoint** using the verification commands above
4. **Notify the mobile team** that the backend is ready

The mobile team was absolutely right - the changes need to be deployed to production. This guide should get you there!
