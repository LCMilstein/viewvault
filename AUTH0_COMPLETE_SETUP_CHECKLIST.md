# Auth0 Complete Setup Checklist for ViewVault

## Current Issues
- ❌ Email verification not working for email/password signups
- ❌ Account linking not working (creates duplicate accounts)
- ❌ Audience URL has typo (missing colon)

## Step-by-Step Fix

### 1. Fix Environment Variables

Check your `secrets.env` file and ensure:

```env
# Auth0 Configuration
AUTH0_DOMAIN=dev-a6z1zwjm1wj3xpjg.us.auth0.com
AUTH0_WEB_CLIENT_ID=6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw
AUTH0_MOBILE_CLIENT_ID=LwycPWxp6CJCRZe7OeA2EvXgrpTTFBwx
AUTH0_CLIENT_SECRET=your-actual-client-secret
AUTH0_AUDIENCE=https://api.viewvault.app  # ← Make sure this has the colon!

# Base URL
BASE_URL=https://app.viewvault.app
```

### 2. Configure Email Verification in Auth0 Dashboard

#### A. Enable Email Verification
1. **Go to**: Auth0 Dashboard → Authentication → Database
2. **Click**: "Username-Password-Authentication"
3. **Settings tab**: Enable "Requires Email Verification"
4. **Save Changes**

#### B. Set Up Email Provider
1. **Go to**: Auth0 Dashboard → Branding → Email Provider
2. **Choose provider**: SendGrid (recommended) or SMTP
3. **Configure credentials**
4. **Test connection**

#### C. Customize Email Template
1. **Go to**: Auth0 Dashboard → Branding → Email Templates
2. **Select**: "Verification Email (using Link)"
3. **Subject**: `Verify your ViewVault account`
4. **Template**: Use the template from `AUTH0_EMAIL_VERIFICATION_SETUP.md`
5. **Save**

### 3. Set Up Account Linking

#### A. Create Pre User Registration Action
1. **Go to**: Auth0 Dashboard → Actions → Flows
2. **Click**: "Pre User Registration"
3. **Add Action**: Use code from `AUTH0_ACCOUNT_LINKING_ACTION.md`
4. **Add Secrets**: AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET
5. **Add Dependencies**: `auth0: 3.7.0`
6. **Deploy and Apply**

### 4. Configure Social Connections

#### A. Google OAuth
1. **Go to**: Auth0 Dashboard → Authentication → Social
2. **Enable**: Google connection
3. **Configure**: With your Google OAuth credentials
4. **Test**: Make sure it works

#### B. GitHub OAuth
1. **Go to**: Auth0 Dashboard → Authentication → Social
2. **Enable**: GitHub connection
3. **Configure**: With your GitHub OAuth credentials
4. **Test**: Make sure it works

### 5. Update Application Settings

1. **Go to**: Auth0 Dashboard → Applications → ViewVault
2. **Allowed Callback URLs**:
   ```
   https://app.viewvault.app/auth0/callback,
   https://app.viewvault.app/email-verified,
   http://localhost:8008/auth0/callback
   ```
3. **Allowed Logout URLs**:
   ```
   https://app.viewvault.app/,
   http://localhost:8008/
   ```
4. **Allowed Web Origins**:
   ```
   https://app.viewvault.app,
   http://localhost:8008
   ```

### 6. Test the Complete Flow

#### Test 1: Email/Password Registration with Verification
1. **Register** with new email/password
2. **Check email** for verification link
3. **Click verification link**
4. **Try to log in** - should work

#### Test 2: OAuth Registration
1. **Sign up with Google** using different email
2. **Verify** account is created
3. **Log out and log back in** - should work

#### Test 3: Account Linking
1. **Sign up with Google** using test email (e.g., test@example.com)
2. **Log out**
3. **Try to register with email/password** using same email
4. **Should get message** about account linking
5. **Check email** for verification
6. **Verify** accounts are linked

### 7. Deploy Backend Changes

The backend fix for the audience URL typo is already implemented. Deploy your latest code.

### 8. Verify Everything Works

#### Web Client Tests
- ✅ Google OAuth login
- ✅ GitHub OAuth login  
- ✅ Email/password registration (with verification)
- ✅ Email/password login
- ✅ Account linking flow

#### Mobile Client Tests
- ✅ Google OAuth login
- ✅ GitHub OAuth login
- ✅ JWT token validation

## Common Issues and Solutions

### Issue: "Test" Button Doesn't Work in Email Templates
**Solution**: This is a known Auth0 issue. The emails work in production even if the test fails.

### Issue: Verification Emails Not Sending
**Solutions**:
1. Check email provider configuration
2. Verify SMTP credentials
3. Check Auth0 logs for delivery errors
4. Make sure "From" email is verified with your provider

### Issue: Account Linking Not Working
**Solutions**:
1. Verify the Action is deployed and added to the flow
2. Check Action logs in Auth0 Dashboard
3. Ensure all secrets are configured correctly
4. Test with different email addresses

### Issue: Mobile App Still Can't Authenticate
**Solutions**:
1. Verify audience URL is fixed (no typo)
2. Check that mobile client ID is configured
3. Ensure both client IDs are supported in backend
4. Test with fresh app install

## Expected Final Behavior

✅ **Email/Password Registration**: 
- User registers → Gets verification email → Clicks link → Can log in

✅ **OAuth Registration**: 
- User signs up with Google/GitHub → Account created → Can log in

✅ **Account Linking**: 
- User has Google account → Tries email/password with same email → Gets linking email → Accounts merged → Can use either method

✅ **No Duplicate Accounts**: 
- One email = One account, multiple login methods

✅ **Mobile Compatibility**: 
- iOS app can authenticate with both Google and GitHub

## Next Steps After Setup

1. **Test thoroughly** with multiple email addresses
2. **Monitor Auth0 logs** for any errors
3. **Update documentation** with final configuration
4. **Train users** on the new authentication flow