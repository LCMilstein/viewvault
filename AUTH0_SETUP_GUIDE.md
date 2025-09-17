# Auth0 Setup Guide for ViewVault

## Overview

This guide will help you set up Auth0 authentication for ViewVault. Auth0 provides a clean, professional OAuth solution that's much more reliable than the previous Supabase attempts.

## Why Auth0?

- **Purpose-built for authentication** - not trying to be everything
- **Excellent documentation** - step-by-step guides that actually work
- **Great iOS integration** - native SDKs available
- **Free tier** - 7,000 active users free
- **No vendor lock-in** - standard OAuth, easy to switch later
- **Professional support** - if you need help

## Step 1: Create Auth0 Account

1. Go to [auth0.com](https://auth0.com)
2. Sign up for a free account
3. Choose your region (US, EU, or AU)

## Step 2: Create Application

1. In Auth0 Dashboard, go to **Applications** → **Applications**
2. Click **Create Application**
3. Name: `ViewVault`
4. Type: **Regular Web Application**
5. Click **Create**

## Step 3: Configure Application

### Basic Settings
1. Go to your application settings
2. Set **Allowed Callback URLs**:
   - `http://localhost:8008/auth0/callback` (for local development)
   - `https://app.viewvault.app/auth0/callback` (for production)
3. Set **Allowed Logout URLs**:
   - `http://localhost:8008/` (for local development)
   - `https://app.viewvault.app/` (for production)
4. Set **Allowed Web Origins**:
   - `http://localhost:8008` (for local development)
   - `https://app.viewvault.app` (for production)

### Advanced Settings
1. Go to **Advanced Settings** → **Grant Types**
2. Enable: **Authorization Code**, **Refresh Token**
3. Go to **Advanced Settings** → **OAuth**
4. Enable: **OIDC Conformant**

## Step 4: Configure Social Connections

### Google OAuth
1. Go to **Authentication** → **Social**
2. Click **Create Connection** → **Google**
3. Enable the connection
4. You'll need to create a Google OAuth app:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized redirect URIs:
     - `https://YOUR_DOMAIN.auth0.com/login/callback`
   - Copy Client ID and Client Secret to Auth0

### GitHub OAuth
1. Go to **Authentication** → **Social**
2. Click **Create Connection** → **GitHub**
3. Enable the connection
4. You'll need to create a GitHub OAuth app:
   - Go to GitHub Settings → Developer settings → OAuth Apps
   - Create new OAuth App
   - Set Authorization callback URL:
     - `https://YOUR_DOMAIN.auth0.com/login/callback`
   - Copy Client ID and Client Secret to Auth0

### Facebook OAuth (Optional)
1. Go to **Authentication** → **Social**
2. Click **Create Connection** → **Facebook**
3. Enable the connection
4. Create Facebook app at [developers.facebook.com](https://developers.facebook.com)
5. Add Auth0 callback URL

### Twitter OAuth (Optional)
1. Go to **Authentication** → **Social**
2. Click **Create Connection** → **Twitter**
3. Enable the connection
4. Create Twitter app at [developer.twitter.com](https://developer.twitter.com)
5. Add Auth0 callback URL

## Step 5: Configure Environment Variables

Update your `secrets.env` file:

```env
# Auth0 Authentication
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_AUDIENCE=your-auth0-audience

# Base URL for callbacks
BASE_URL=https://app.viewvault.app
```

### How to find these values:

1. **AUTH0_DOMAIN**: In Auth0 Dashboard → Applications → Your App → Settings → Domain
2. **AUTH0_CLIENT_ID**: In Auth0 Dashboard → Applications → Your App → Settings → Client ID
3. **AUTH0_CLIENT_SECRET**: In Auth0 Dashboard → Applications → Your App → Settings → Client Secret
4. **AUTH0_AUDIENCE**: In Auth0 Dashboard → Applications → APIs → Your API → Identifier
   - If you don't have an API, create one:
     - Go to Applications → APIs → Create API
     - Name: `ViewVault API`
     - Identifier: `https://api.viewvault.app`
     - Signing Algorithm: `RS256`

## Step 6: Deploy and Test

1. Deploy the new image: `lcmilstein/viewvault:auth0-implementation`
2. Visit `https://app.viewvault.app/login`
3. Test each OAuth provider
4. Verify JWT tokens are created correctly

## Step 7: iOS Client Integration

For the iOS team, they'll need to:

1. Install Auth0 iOS SDK: `pod 'Auth0'`
2. Configure Auth0 in their app
3. Use Auth0's native login methods
4. Send the Auth0 JWT to your backend

### iOS Code Example:
```swift
import Auth0

// Login with Google
Auth0.webAuth()
    .scope("openid profile email")
    .audience("https://api.viewvault.app")
    .start { result in
        switch result {
        case .success(let credentials):
            // Send credentials.idToken to your backend
            // Your backend will validate and create a ViewVault JWT
        case .failure(let error):
            print("Login failed: \(error)")
        }
    }
```

## Troubleshooting

### Common Issues:

1. **"Invalid redirect URI"**
   - Check that callback URLs are exactly correct in Auth0 dashboard
   - Ensure BASE_URL environment variable is set correctly

2. **"Invalid client"**
   - Verify AUTH0_CLIENT_ID is correct
   - Check that the application type is "Regular Web Application"

3. **"Invalid audience"**
   - Make sure AUTH0_AUDIENCE matches your API identifier
   - Create an API in Auth0 if you haven't already

4. **"Connection not found"**
   - Ensure social connections are enabled in Auth0 dashboard
   - Check that connection names match what's in the code

### Debug Mode:

Add this to your environment for detailed logging:
```env
AUTH0_DEBUG=true
```

## Migration from JWT

Since you don't have users yet, this is a clean migration:

1. **Current state**: JWT-only authentication
2. **New state**: Auth0 OAuth + JWT creation
3. **Future**: Gradually migrate iOS clients to Auth0
4. **Eventually**: Remove JWT system entirely

## Benefits of This Approach

- **Reliable**: Auth0 handles all OAuth complexity
- **Scalable**: Grows with your business
- **Maintainable**: Less custom code to maintain
- **Professional**: Industry-standard authentication
- **Flexible**: Easy to add more providers later

## Next Steps

1. Set up Auth0 account and application
2. Configure environment variables
3. Deploy and test
4. Provide iOS team with integration guide
5. Monitor usage and scale as needed

## Support

- Auth0 Documentation: [auth0.com/docs](https://auth0.com/docs)
- Auth0 Community: [community.auth0.com](https://community.auth0.com)
- ViewVault Issues: Create GitHub issue for ViewVault-specific problems
