# Auth0 Email Verification via Actions

## Modern Approach: Post User Registration Action

Since Auth0 has moved email verification settings, we'll use an Action to enforce email verification.

### Step 1: Create Post User Registration Action

1. **Go to Auth0 Dashboard** → **Actions** → **Flows**
2. **Click on "Post User Registration"**
3. **Click "+" to add a new action**
4. **Choose "Build from scratch"**
5. **Name**: `Email Verification Enforcer`
6. **Runtime**: `Node.js 18`

### Step 2: Action Code

```javascript
/**
 * Handler that will be called during the execution of a PostUserRegistration flow.
 * @param {Event} event - Details about the context and user that has registered.
 * @param {PostUserRegistrationAPI} api - Interface whose methods can be used to change the behavior of the registration.
 */
exports.onExecutePostUserRegistration = async (event, api) => {
  const { user, connection } = event;
  
  // Only handle email/password registrations (not OAuth)
  if (connection.name !== 'Username-Password-Authentication') {
    return;
  }
  
  // Check if user already has verified email (shouldn't happen for new registrations)
  if (user.email_verified) {
    return;
  }
  
  const ManagementClient = require('auth0').ManagementClient;
  
  const management = new ManagementClient({
    domain: event.secrets.AUTH0_DOMAIN,
    clientId: event.secrets.AUTH0_CLIENT_ID,
    clientSecret: event.secrets.AUTH0_CLIENT_SECRET,
    scope: 'update:users'
  });
  
  try {
    // Send email verification
    await management.sendEmailVerification({
      user_id: user.user_id,
      client_id: event.secrets.AUTH0_CLIENT_ID
    });
    
    console.log(`Email verification sent to ${user.email}`);
    
    // Block the user from logging in until email is verified
    await management.updateUser(
      { id: user.user_id },
      { 
        blocked: true,
        user_metadata: {
          email_verification_required: true,
          registration_date: new Date().toISOString()
        }
      }
    );
    
    console.log(`User ${user.user_id} blocked until email verification`);
    
  } catch (error) {
    console.error('Error in email verification flow:', error);
  }
};
```

### Step 3: Create Post Login Action (to unblock verified users)

1. **Go to Actions** → **Flows** → **Post Login**
2. **Create new action**: `Email Verification Checker`

```javascript
/**
 * Handler that will be called during the execution of a PostLogin flow.
 * @param {Event} event - Details about the context and user that is attempting to login.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {
  const { user } = event;
  
  // Only check email/password users
  if (!user.user_id.startsWith('auth0|')) {
    return;
  }
  
  // If user has verified email but is still blocked, unblock them
  if (user.email_verified && user.blocked && user.user_metadata?.email_verification_required) {
    const ManagementClient = require('auth0').ManagementClient;
    
    const management = new ManagementClient({
      domain: event.secrets.AUTH0_DOMAIN,
      clientId: event.secrets.AUTH0_CLIENT_ID,
      clientSecret: event.secrets.AUTH0_CLIENT_SECRET,
      scope: 'update:users'
    });
    
    try {
      // Unblock the user
      await management.updateUser(
        { id: user.user_id },
        { 
          blocked: false,
          user_metadata: {
            ...user.user_metadata,
            email_verification_required: false,
            email_verified_date: new Date().toISOString()
          }
        }
      );
      
      console.log(`User ${user.user_id} unblocked after email verification`);
      
    } catch (error) {
      console.error('Error unblocking verified user:', error);
    }
  }
  
  // If user hasn't verified email, deny login
  if (!user.email_verified && user.user_id.startsWith('auth0|')) {
    api.access.deny('Please verify your email address before logging in. Check your inbox for a verification email.');
  }
};
```

### Step 4: Configure Action Secrets

For both actions, add these secrets:
```
AUTH0_DOMAIN: dev-a6z1zwjm1wj3xpjg.us.auth0.com
AUTH0_CLIENT_ID: 6O0NKgLmUN6fo0psLnu6jNUYQERk5fRw
AUTH0_CLIENT_SECRET: your-client-secret
```

### Step 5: Add Dependencies

For both actions, add dependency:
```
auth0: 3.7.0
```

### Step 6: Deploy and Apply Actions

1. **Deploy both actions**
2. **Add to their respective flows**
3. **Apply the flows**

## Expected Behavior

- ✅ User registers with email/password
- ✅ Verification email sent automatically
- ✅ User account is blocked until verification
- ✅ User clicks verification link
- ✅ User can now log in successfully
- ✅ OAuth users (Google/GitHub) bypass this flow

## Alternative: Check Other Auth0 Locations

While setting up the Actions, also check these locations in your Auth0 Dashboard:

1. **Settings** → **General** → Look for email verification settings
2. **Authentication** → **Authentication Profile**
3. **Branding** → **Universal Login** → Advanced settings
4. **Applications** → **ViewVault** → **Settings** → Advanced settings

The setting might be in any of these locations depending on your Auth0 plan and version.